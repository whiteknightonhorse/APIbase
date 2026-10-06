<?php
/**
 * Catalog sync: product hooks -> queue -> Action Scheduler batches (<= 500) -> PUT /catalog.
 *
 * @package apibase-ai-payment
 * @license GPL-2.0-or-later
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Apibase_Sync {
	const QUEUE  = 'apibase_sync_queue';
	const REPORT = 'apibase_sync_report';
	const ACTION = 'apibase_sync_batch';

	public static function register() {
		foreach ( array( 'woocommerce_update_product', 'woocommerce_new_product', 'woocommerce_product_set_stock' ) as $hook ) {
			add_action( $hook, array( __CLASS__, 'on_change' ) );
		}
		add_action( 'woocommerce_delete_product', array( __CLASS__, 'on_delete' ) );
		add_action( self::ACTION, array( __CLASS__, 'run_batch' ) );
		add_action( 'admin_post_apibase_sync_now', array( __CLASS__, 'sync_now' ) );
	}

	private static function queue() {
		$q = get_option( self::QUEUE, array() );
		return array(
			'up'  => isset( $q['up'] ) ? (array) $q['up'] : array(),
			'del' => isset( $q['del'] ) ? (array) $q['del'] : array(),
		);
	}

	private static function schedule() {
		if ( function_exists( 'as_enqueue_async_action' ) && ! as_has_scheduled_action( self::ACTION ) ) {
			as_enqueue_async_action( self::ACTION, array(), 'apibase' );
		}
	}

	public static function on_change( $product_id ) {
		if ( ! Apibase_Settings::sync_enabled() ) {
			return;
		}
		$product = wc_get_product( $product_id );
		if ( $product && $product->get_parent_id() ) {
			$product_id = $product->get_parent_id();
		}
		$q                          = self::queue();
		$q['up'][ (int) $product_id ] = (int) $product_id;
		update_option( self::QUEUE, $q );
		self::schedule();
	}

	public static function on_delete( $product_id ) {
		if ( ! Apibase_Settings::sync_enabled() ) {
			return;
		}
		$product = wc_get_product( $product_id );
		$sku     = $product ? (string) $product->get_sku() : '';
		if ( '' === $sku ) {
			return;
		}
		$q          = self::queue();
		$q['del'][ $sku ] = $sku;
		unset( $q['up'][ (int) $product_id ] );
		update_option( self::QUEUE, $q );
		self::schedule();
	}

	public static function sync_now() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( 'Not allowed.', 403 );
		}
		check_admin_referer( 'apibase_sync_now' );
		if ( Apibase_Settings::sync_enabled() ) {
			$q = self::queue();
			foreach ( wc_get_products( array( 'status' => 'publish', 'limit' => -1, 'return' => 'ids' ) ) as $id ) {
				$q['up'][ (int) $id ] = (int) $id;
			}
			update_option( self::QUEUE, $q );
			self::run_batch();
		}
		wp_safe_redirect( admin_url( 'admin.php?page=wc-settings&tab=apibase' ) );
		exit;
	}

	/** Sends one batch (at most 500 upserts, then at most 500 deletes) and re-schedules while work remains. */
	public static function run_batch() {
		if ( ! Apibase_Settings::sync_enabled() ) {
			return;
		}
		$q      = self::queue();
		$report = get_option( self::REPORT, array() );
		if ( empty( $report['started'] ) || ! empty( $report['done'] ) ) {
			$report = array( 'upserted' => 0, 'rejected' => array(), 'skipped' => array(), 'errors' => array(), 'started' => gmdate( 'c' ), 'done' => false );
		}

		$ids  = array_slice( array_values( $q['up'] ), 0, Apibase_Catalog::BATCH );
		$cmap = (array) Apibase_Settings::get( 'category_map', array() );
		$ship = $ids ? Apibase_Catalog::shipping_options() : array();
		$items = array();
		foreach ( $ids as $id ) {
			$p = wc_get_product( $id );
			if ( ! $p ) {
				continue;
			}
			$m = Apibase_Catalog::map( $p, $cmap, $ship );
			if ( $m['item'] ) {
				$items[] = $m['item'];
			} else {
				$report['skipped'][] = array( 'sku' => $m['sku'], 'reason' => $m['skip'] );
			}
		}
		$failed = false;
		if ( $items ) {
			$r = Apibase_Api::request( 'PUT', '/catalog', array( 'items' => $items ) );
			if ( 200 === $r['status'] && is_array( $r['body'] ) ) {
				$report['upserted'] += (int) ( $r['body']['upserted'] ?? 0 );
				foreach ( (array) ( $r['body']['rejected'] ?? array() ) as $x ) {
					$report['rejected'][] = array( 'sku' => (string) ( $x['sku'] ?? '' ), 'reason' => (string) ( $x['reason'] ?? '' ) );
				}
				foreach ( (array) ( $r['body']['errors'] ?? array() ) as $x ) {
					$report['rejected'][] = array( 'sku' => (string) ( $x['sku'] ?? '' ), 'reason' => (string) ( $x['message'] ?? '' ) );
				}
			} else {
				$failed             = true;
				$report['errors'][] = 'upsert failed: HTTP ' . $r['status'];
			}
		}
		$dels = array_slice( array_values( $q['del'] ), 0, Apibase_Catalog::BATCH );
		if ( $dels && ! $failed ) {
			$r = Apibase_Api::request( 'DELETE', '/catalog', array( 'skus' => $dels ) );
			if ( 200 !== $r['status'] ) {
				$failed             = true;
				$report['errors'][] = 'delete failed: HTTP ' . $r['status'];
			}
		}
		if ( ! $failed ) {
			foreach ( $ids as $id ) {
				unset( $q['up'][ $id ] );
			}
			foreach ( $dels as $s ) {
				unset( $q['del'][ $s ] );
			}
		}
		update_option( self::QUEUE, $q );
		$more           = ! $failed && ( $q['up'] || $q['del'] );
		$report['done'] = ! $more;
		update_option( self::REPORT, $report );
		if ( $more ) {
			self::schedule();
		}
	}
}
