<?php
/**
 * Settings storage (one option, secrets sealed) and the WooCommerce > Settings > AI payment tab.
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

class Apibase_Settings {
	const OPTION = 'apibase_settings';

	public static function all() {
		$s = get_option( self::OPTION, array() );
		return is_array( $s ) ? $s : array();
	}

	public static function get( $key, $default = '' ) {
		$s = self::all();
		return isset( $s[ $key ] ) ? $s[ $key ] : $default;
	}

	public static function slug() {
		return (string) self::get( 'slug' );
	}

	public static function api_key() {
		return Apibase_Crypto::decrypt( (string) self::get( 'mk_enc' ) );
	}

	public static function webhook_secret() {
		return Apibase_Crypto::decrypt( (string) self::get( 'whsec_enc' ) );
	}

	/** Catalog prices are USD only (F-2): any other store currency disables the sync. */
	public static function currency_ok() {
		return 'USD' === get_woocommerce_currency();
	}

	public static function sync_enabled() {
		return self::currency_ok() && '' !== self::slug() && '' !== self::api_key();
	}

	public static function flag( $name ) {
		return 'yes' === self::get( $name, 'yes' );
	}

	/**
	 * Saves the posted form. A secret field that is empty or still shows the mask keeps the stored value.
	 *
	 * @param array $post Raw posted values.
	 */
	public static function save( array $post ) {
		$s    = self::all();
		$slug = isset( $post['apibase_slug'] ) ? strtolower( trim( (string) $post['apibase_slug'] ) ) : '';
		if ( '' === $slug || preg_match( '/^[a-z0-9][a-z0-9-]{1,62}$/', $slug ) ) {
			$s['slug'] = $slug;
		}
		$mk = isset( $post['apibase_key'] ) ? trim( (string) $post['apibase_key'] ) : '';
		if ( preg_match( '/^mk_live_[0-9a-f]{32}$/', $mk ) ) {
			$s['mk_enc'] = Apibase_Crypto::encrypt( $mk );
		}
		$wh = isset( $post['apibase_whsec'] ) ? trim( (string) $post['apibase_whsec'] ) : '';
		if ( preg_match( '/^whsec_[0-9a-f]{32}$/', $wh ) ) {
			$s['whsec_enc'] = Apibase_Crypto::encrypt( $wh );
		}
		foreach ( array( 'flag_button', 'flag_markup', 'flag_wellknown' ) as $f ) {
			$s[ $f ] = empty( $post[ 'apibase_' . $f ] ) ? 'no' : 'yes';
		}
		$map = array();
		if ( isset( $post['apibase_catmap'] ) && is_array( $post['apibase_catmap'] ) ) {
			$allowed = Apibase_Catalog::allowed_categories();
			foreach ( $post['apibase_catmap'] as $term_id => $target ) {
				if ( in_array( $target, $allowed, true ) ) {
					$map[ (int) $term_id ] = (string) $target;
				}
			}
		}
		$s['category_map'] = $map;
		update_option( self::OPTION, $s );
	}

	public static function register() {
		add_filter( 'woocommerce_settings_tabs_array', array( __CLASS__, 'add_tab' ), 60 );
		add_action( 'woocommerce_settings_tabs_apibase', array( __CLASS__, 'render' ) );
		add_action( 'woocommerce_update_options_apibase', array( __CLASS__, 'on_save' ) );
	}

	public static function add_tab( $tabs ) {
		$tabs['apibase'] = 'AI payment';
		return $tabs;
	}

	public static function on_save() {
		// WooCommerce verifies its own settings nonce before firing this action.
		// phpcs:ignore WordPress.Security.NonceVerification
		self::save( wp_unslash( $_POST ) );
	}

	public static function render() {
		$s = self::all();
		echo '<h2>' . esc_html( 'AI payment (APIbase)' ) . '</h2>';
		if ( ! self::currency_ok() ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html( 'Your store currency is not USD. APIbase prices are USD only, so catalog sync is switched off.' ) . '</p></div>';
		}
		echo '<table class="form-table">';
		self::row( 'Merchant slug', '<input type="text" name="apibase_slug" value="' . esc_attr( self::slug() ) . '" />' );
		self::row( 'API key (mk_live_)', '<input type="password" autocomplete="off" name="apibase_key" value="" placeholder="' . esc_attr( Apibase_Crypto::mask( self::api_key() ) ) . '" />' );
		self::row( 'Webhook secret (whsec_)', '<input type="password" autocomplete="off" name="apibase_whsec" value="" placeholder="' . esc_attr( Apibase_Crypto::mask( self::webhook_secret() ) ) . '" />' );
		self::row( 'Webhook URL', '<code>' . esc_html( rest_url( 'apibase/v1/webhook' ) ) . '</code>' );
		self::row( 'Button on the product page', self::checkbox( 'flag_button' ) );
		self::row( 'Machine-readable markup', self::checkbox( 'flag_markup' ) );
		self::row( 'Serve /.well-known/apibase-merchant.txt', self::checkbox( 'flag_wellknown' ) );
		echo '</table>';
		if ( function_exists( 'get_terms' ) ) {
			echo '<h3>' . esc_html( 'Category mapping' ) . '</h3><table class="form-table">';
			$terms = get_terms( array( 'taxonomy' => 'product_cat', 'hide_empty' => false ) );
			$map   = isset( $s['category_map'] ) ? $s['category_map'] : array();
			foreach ( is_array( $terms ) ? $terms : array() as $term ) {
				$sel = '<select name="apibase_catmap[' . (int) $term->term_id . ']"><option value="">(skip these products)</option>';
				foreach ( Apibase_Catalog::allowed_categories() as $c ) {
					$sel .= '<option value="' . esc_attr( $c ) . '"' . ( isset( $map[ $term->term_id ] ) && $map[ $term->term_id ] === $c ? ' selected' : '' ) . '>' . esc_html( $c ) . '</option>';
				}
				self::row( $term->name, $sel . '</select>' );
			}
			echo '</table>';
		}
		self::report();
		$url = wp_nonce_url( admin_url( 'admin-post.php?action=apibase_sync_now' ), 'apibase_sync_now' );
		echo '<p><a class="button" href="' . esc_url( $url ) . '">' . esc_html( 'Sync now' ) . '</a></p>';
	}

	private static function checkbox( $name ) {
		return '<input type="checkbox" name="apibase_' . esc_attr( $name ) . '" value="1"' . ( self::flag( $name ) ? ' checked' : '' ) . ' />';
	}

	private static function row( $label, $html ) {
		// $html is assembled above from escaped parts only.
		echo '<tr><th>' . esc_html( $label ) . '</th><td>' . $html . '</td></tr>'; // phpcs:ignore WordPress.Security.EscapeOutput
	}

	private static function report() {
		$r = get_option( 'apibase_sync_report', array() );
		if ( empty( $r ) ) {
			return;
		}
		echo '<h3>' . esc_html( 'Last sync' ) . '</h3><p>' . esc_html( sprintf( 'upserted: %d, rejected: %d, skipped: %d', (int) $r['upserted'], count( $r['rejected'] ), count( $r['skipped'] ) ) ) . '</p><ul>';
		foreach ( array_merge( $r['rejected'], $r['skipped'] ) as $row ) {
			echo '<li>' . esc_html( $row['sku'] . ': ' . $row['reason'] ) . '</li>';
		}
		echo '</ul>';
	}
}
