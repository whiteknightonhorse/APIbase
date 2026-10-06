<?php
/**
 * POST /wp-json/apibase/v1/webhook receiver: signature, de-duplication, order.paid -> WooCommerce order.
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

class Apibase_Webhook {
	const MAX_FULFILLMENT_BYTES = 16384;

	public static function register() {
		register_rest_route(
			'apibase/v1',
			'/webhook',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'rest' ),
				'permission_callback' => '__return_true', // Authenticated by the HMAC signature instead.
			)
		);
	}

	public static function rest( $request ) {
		$res = self::handle(
			(string) $request->get_body(),
			array(
				'signature'   => (string) $request->get_header( 'x_apibase_signature' ),
				'delivery_id' => (string) $request->get_header( 'x_apibase_delivery_id' ),
			),
			time()
		);
		return new WP_REST_Response( $res['body'], $res['status'] );
	}

	/**
	 * @param string $raw     Raw body.
	 * @param array  $headers signature, delivery_id.
	 * @param int    $now     Unix time.
	 * @return array{status:int, body:array}
	 */
	public static function handle( $raw, array $headers, $now ) {
		if ( ! Apibase_Signature::verify( $headers['signature'], $raw, Apibase_Settings::webhook_secret(), $now ) ) {
			return array( 'status' => 401, 'body' => array( 'error' => 'bad_signature' ) );
		}
		$msg = json_decode( $raw, true );
		if ( ! is_array( $msg ) || empty( $msg['event'] ) || ! preg_match( '/^[A-Za-z0-9._-]{1,64}$/', $headers['delivery_id'] ) ) {
			return array( 'status' => 400, 'body' => array( 'error' => 'bad_request' ) );
		}
		$event = (string) $msg['event'];
		$data  = isset( $msg['data'] ) && is_array( $msg['data'] ) ? $msg['data'] : array();
		$oid   = isset( $data['order_id'] ) && is_string( $data['order_id'] ) ? $data['order_id'] : null;

		if ( ! Apibase_Deliveries::claim( $headers['delivery_id'], $oid, $event ) ) {
			return array( 'status' => 200, 'body' => array( 'duplicate' => true ) );
		}
		try {
			if ( 'order.paid' === $event && null !== $oid ) {
				return self::order_paid( $oid, $data );
			}
			if ( ( 'order.cancelled' === $event || 'refund.requested' === $event ) && null !== $oid ) {
				self::note( $oid, $event, $data );
			}
		} catch ( Throwable $e ) {
			Apibase_Deliveries::release( $headers['delivery_id'] );
			return array( 'status' => 500, 'body' => array( 'error' => 'internal' ) );
		}
		return array( 'status' => 200, 'body' => array( 'ok' => true ) );
	}

	private static function order_paid( $apibase_order_id, array $data ) {
		$lines = array();
		foreach ( isset( $data['items'] ) && is_array( $data['items'] ) ? $data['items'] : array() as $item ) {
			$sku = isset( $item['sku'] ) ? (string) $item['sku'] : '';
			$qty = isset( $item['quantity'] ) ? max( 1, (int) $item['quantity'] ) : 1;
			$id  = '' === $sku ? 0 : wc_get_product_id_by_sku( $sku );
			if ( ! $id ) {
				throw new RuntimeException( 'unknown sku' );
			}
			$lines[] = array( wc_get_product( $id ), $qty );
		}

		$order    = wc_create_order( array( 'status' => 'pending' ) );
		$physical = false;
		$dl       = false;
		foreach ( $lines as $line ) {
			$order->add_product( $line[0], $line[1] );
			$physical = $physical || ! $line[0]->is_virtual();
			$dl       = $dl || $line[0]->is_downloadable();
		}
		$order->set_payment_method( 'apibase_ai_payment' );
		$order->set_payment_method_title( 'AI payment — APIbase' );
		$order->set_billing_email( 'order-' . $apibase_order_id . '@agent.invalid' );
		$order->update_meta_data( '_apibase_order_id', $apibase_order_id );
		$order->update_meta_data( '_apibase_tx_hash', isset( $data['tx_hash'] ) ? (string) $data['tx_hash'] : '' );
		$order->update_meta_data( '_apibase_rail', isset( $data['rail'] ) ? (string) $data['rail'] : '' );
		$payer = isset( $data['payer_wallet'] ) ? (string) $data['payer_wallet'] : '';
		$order->update_meta_data( '_apibase_payer_prefix', substr( $payer, 0, 8 ) );
		// PII envelopes stay sealed: stored exactly as received, never opened by the plugin.
		if ( ! empty( $data['pii'] ) ) {
			$order->update_meta_data( '_apibase_pii_envelopes', wp_json_encode( $data['pii'] ) );
		}
		$order->calculate_totals();
		$order->set_status( $physical ? 'processing' : 'completed' );
		$order->save();

		$body = array( 'ok' => true );
		if ( $dl ) {
			$urls = array();
			foreach ( $lines as $line ) {
				foreach ( array_keys( $line[0]->get_downloads() ) as $download_id ) {
					wc_downloadable_file_permission( $download_id, $line[0]->get_id(), $order, $line[1] );
				}
			}
			foreach ( $order->get_downloadable_items() as $item ) {
				$urls[] = $item['download_url'];
			}
			$fulfillment = array( 'type' => 'url', 'urls' => $urls );
			if ( $urls && strlen( wp_json_encode( $fulfillment ) ) <= self::MAX_FULFILLMENT_BYTES ) {
				$body['fulfillment'] = $fulfillment;
			}
		}
		return array( 'status' => 200, 'body' => $body );
	}

	private static function note( $apibase_order_id, $event, array $data ) {
		$found = wc_get_orders(
			array(
				'limit'      => 1,
				'meta_key'   => '_apibase_order_id', // phpcs:ignore WordPress.DB.SlowDBQuery
				'meta_value' => $apibase_order_id, // phpcs:ignore WordPress.DB.SlowDBQuery
			)
		);
		if ( empty( $found ) ) {
			return;
		}
		$text = 'order.cancelled' === $event
			? 'APIbase: the buyer cancelled this order.'
			: 'APIbase: a refund was requested for this order.' . ( isset( $data['amount'] ) ? ' Amount: ' . preg_replace( '/[^0-9.]/', '', (string) $data['amount'] ) . ' USDC.' : '' );
		$found[0]->add_order_note( $text );
	}
}
