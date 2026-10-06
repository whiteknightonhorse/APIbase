<?php
/**
 * Product-page link, <link rel=alternate>, JSON-LD BuyAction, /.well-known/apibase-merchant.txt. No JavaScript.
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

class Apibase_Storefront {
	public static function register() {
		add_action( 'woocommerce_single_product_summary', array( __CLASS__, 'print_button' ), 35 );
		add_action( 'wp_head', array( __CLASS__, 'print_head' ) );
		add_action( 'init', array( __CLASS__, 'serve_files' ), 1 );
	}

	public static function button_html( $slug, $sku ) {
		return '<a href="' . esc_url( APIBASE_BASE_URL . '/m/' . rawurlencode( $slug ) . '/p/' . rawurlencode( $sku ) ) . '" rel="alternate payment" class="apibase-ai-buy" style="display:inline-block;margin:8px 0;padding:8px 14px;border:1px solid #444;border-radius:4px;color:inherit;text-decoration:none">Buy with your AI agent</a>';
	}

	public static function head_html( $slug, $sku, $name ) {
		$base = APIBASE_BASE_URL;
		$ld   = array(
			'@context'        => 'https://schema.org',
			'@type'           => 'Offer',
			'sku'             => $sku,
			'name'            => $name,
			'potentialAction' => array(
				'@type'  => 'BuyAction',
				'target' => $base . '/mcp/m/' . rawurlencode( $slug ),
			),
		);
		return '<link rel="alternate" type="application/json" href="' . esc_url( $base . '/m/' . rawurlencode( $slug ) . '/agent.json' ) . '" />' . "\n"
			. '<script type="application/ld+json">' . wp_json_encode( $ld, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG ) . '</script>' . "\n";
	}

	private static function current() {
		$slug = Apibase_Settings::slug();
		if ( '' === $slug || ! function_exists( 'is_product' ) || ! is_product() ) {
			return null;
		}
		$p = wc_get_product( get_the_ID() );
		return ( $p && '' !== (string) $p->get_sku() ) ? array( $slug, (string) $p->get_sku(), $p->get_name() ) : null;
	}

	public static function print_button() {
		$c = self::current();
		if ( $c && Apibase_Settings::flag( 'flag_button' ) ) {
			echo self::button_html( $c[0], $c[1] ); // phpcs:ignore WordPress.Security.EscapeOutput -- built from escaped parts.
		}
	}

	public static function print_head() {
		$c = self::current();
		if ( $c && Apibase_Settings::flag( 'flag_markup' ) ) {
			echo self::head_html( $c[0], $c[1], $c[2] ); // phpcs:ignore WordPress.Security.EscapeOutput -- built from escaped parts.
		}
	}

	/** Serves the INT-15 domain proof and, only when the site has none of its own, a /llms.txt line. */
	public static function serve_files() {
		$path = isset( $_SERVER['REQUEST_URI'] ) ? wp_parse_url( wp_unslash( $_SERVER['REQUEST_URI'] ), PHP_URL_PATH ) : '';
		$slug = Apibase_Settings::slug();
		if ( '' === $slug ) {
			return;
		}
		if ( '/.well-known/apibase-merchant.txt' === $path && Apibase_Settings::flag( 'flag_wellknown' ) ) {
			header( 'Content-Type: text/plain; charset=utf-8' );
			echo esc_html( $slug ) . "\n";
			exit;
		}
		if ( '/llms.txt' === $path && ! file_exists( ABSPATH . 'llms.txt' ) && Apibase_Settings::flag( 'flag_markup' ) ) {
			header( 'Content-Type: text/plain; charset=utf-8' );
			echo '# ' . esc_html( get_bloginfo( 'name' ) ) . "\n\n- AI agents can buy here: " . esc_url_raw( APIBASE_BASE_URL . '/m/' . rawurlencode( $slug ) ) . "\n";
			exit;
		}
	}
}
