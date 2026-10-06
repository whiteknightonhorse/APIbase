<?php
/**
 * Minimal WordPress / WooCommerce stand-ins so the plugin logic runs under plain php-cli.
 *
 * @package apibase-ai-payment
 * @license GPL-2.0-or-later
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 */

define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['t_options']  = array();
$GLOBALS['t_actions']  = array();
$GLOBALS['t_http']     = array();
$GLOBALS['t_http_res'] = array( 'code' => 200, 'body' => '{}' );
$GLOBALS['t_currency'] = 'USD';
$GLOBALS['t_products'] = array();
$GLOBALS['t_orders']   = array();
$GLOBALS['t_is_product'] = true;

function wp_salt( $s = 'auth' ) {
	return 'test-salt-' . $s;
}
function get_option( $k, $d = false ) {
	return array_key_exists( $k, $GLOBALS['t_options'] ) ? $GLOBALS['t_options'][ $k ] : $d;
}
function update_option( $k, $v ) {
	$GLOBALS['t_options'][ $k ] = $v;
	return true;
}
function add_action( $h, $cb, $p = 10, $n = 1 ) {
	$GLOBALS['t_actions'][ $h ][] = $cb;
}
function add_filter( $h, $cb, $p = 10, $n = 1 ) {
	$GLOBALS['t_actions'][ $h ][] = $cb;
}
function register_rest_route() {}
function register_activation_hook() {}
function get_woocommerce_currency() {
	return $GLOBALS['t_currency'];
}
function esc_html( $s ) {
	return htmlspecialchars( (string) $s, ENT_QUOTES );
}
function esc_attr( $s ) {
	return htmlspecialchars( (string) $s, ENT_QUOTES );
}
function esc_url( $s ) {
	return htmlspecialchars( (string) $s, ENT_QUOTES );
}
function esc_url_raw( $s ) {
	return (string) $s;
}
function wp_strip_all_tags( $s ) {
	return trim( preg_replace( '/\s+/', ' ', strip_tags( (string) $s ) ) );
}
function wp_json_encode( $v, $flags = 0 ) {
	return json_encode( $v, $flags );
}
function wp_parse_url( $u, $c = -1 ) {
	return parse_url( $u, $c );
}
function wp_unslash( $v ) {
	return $v;
}
function is_wp_error( $x ) {
	return false;
}
function wp_remote_request( $url, $args ) {
	$GLOBALS['t_http'][] = array( 'url' => $url, 'args' => $args );
	return $GLOBALS['t_http_res'];
}
function wp_remote_retrieve_response_code( $r ) {
	return $r['code'];
}
function wp_remote_retrieve_body( $r ) {
	return $r['body'];
}
function wp_get_attachment_url( $id ) {
	return 'https://shop.test/img/' . $id . '.jpg';
}
function is_product() {
	return $GLOBALS['t_is_product'];
}
function get_the_ID() {
	return 1;
}
function wc_get_product( $id ) {
	return isset( $GLOBALS['t_products'][ $id ] ) ? $GLOBALS['t_products'][ $id ] : null;
}
function wc_get_product_id_by_sku( $sku ) {
	foreach ( $GLOBALS['t_products'] as $id => $p ) {
		if ( $p->get_sku() === $sku ) {
			return $id;
		}
	}
	return 0;
}
function wc_get_order( $id ) {
	return isset( $GLOBALS['t_orders'][ $id ] ) ? $GLOBALS['t_orders'][ $id ] : null;
}
function wc_get_orders( $args ) {
	$out = array();
	foreach ( $GLOBALS['t_orders'] as $o ) {
		if ( $o->get_meta( $args['meta_key'] ) === $args['meta_value'] ) {
			$out[] = $o;
		}
	}
	return $out;
}
function wc_create_order( $args = array() ) {
	$o                                 = new T_Order( count( $GLOBALS['t_orders'] ) + 1 );
	$GLOBALS['t_orders'][ $o->get_id() ] = $o;
	return $o;
}
function wc_downloadable_file_permission( $download_id, $product_id, $order, $qty = 1 ) {
	$order->perms[] = array( $download_id, $product_id );
}

class T_Order {
	public $id; public $meta = array(); public $lines = array(); public $status = 'pending';
	public $notes = array(); public $perms = array(); public $email = ''; public $method = ''; public $title = '';
	public function __construct( $id ) { $this->id = $id; }
	public function get_id() { return $this->id; }
	public function add_product( $p, $q ) { $this->lines[] = array( $p, $q ); }
	public function set_payment_method( $m ) { $this->method = $m; }
	public function set_payment_method_title( $t ) { $this->title = $t; }
	public function set_billing_email( $e ) { $this->email = $e; }
	public function update_meta_data( $k, $v ) { $this->meta[ $k ] = $v; }
	public function get_meta( $k ) { return isset( $this->meta[ $k ] ) ? $this->meta[ $k ] : ''; }
	public function calculate_totals() {}
	public function set_status( $s ) { $this->status = $s; }
	public function save() {}
	public function add_order_note( $n ) { $this->notes[] = $n; }
	public function get_amount() { return $this->meta['_amount'] ?? 0; }
	public function get_downloadable_items() {
		$out = array();
		foreach ( $this->perms as $p ) {
			$out[] = array( 'download_url' => 'https://shop.test/?download_file=' . $p[1] . '&key=' . $p[0] . '&order=' . $this->id );
		}
		return $out;
	}
}

class T_Product {
	public $d;
	public function __construct( array $d ) { $this->d = $d + array( 'type' => 'simple', 'virtual' => false, 'downloadable' => false, 'stock' => null, 'cats' => array(), 'children' => array(), 'downloads' => array(), 'desc' => '', 'short' => '', 'img' => 0, 'attrs' => array(), 'parent' => 0 ); }
	public function get_id() { return $this->d['id']; }
	public function get_sku() { return $this->d['sku']; }
	public function get_name() { return $this->d['name']; }
	public function get_description() { return $this->d['desc']; }
	public function get_short_description() { return $this->d['short']; }
	public function get_price() { return $this->d['price']; }
	public function managing_stock() { return null !== $this->d['stock']; }
	public function get_stock_quantity() { return $this->d['stock']; }
	public function get_image_id() { return $this->d['img']; }
	public function get_gallery_image_ids() { return array(); }
	public function get_category_ids() { return $this->d['cats']; }
	public function is_virtual() { return $this->d['virtual']; }
	public function is_downloadable() { return $this->d['downloadable']; }
	public function is_type( $t ) { return $this->d['type'] === $t; }
	public function get_children() { return $this->d['children']; }
	public function get_downloads() { return $this->d['downloads']; }
	public function get_variation_attributes() { return $this->d['attrs']; }
	public function get_parent_id() { return $this->d['parent']; }
}

class T_Method {
	public $id = 'flat_rate'; public $enabled = 'yes'; public $cost;
	public function __construct( $cost ) { $this->cost = $cost; }
	public function get_instance_id() { return 7; }
	public function get_option( $k, $d = '' ) { return $this->cost; }
}
class WC_Shipping_Zones {
	public static function get_zones() {
		return array( array( 'id' => 1, 'zone_name' => 'Europe', 'zone_locations' => array( (object) array( 'type' => 'country', 'code' => 'DE' ), (object) array( 'type' => 'country', 'code' => 'FR' ) ), 'shipping_methods' => array( new T_Method( '5.5' ) ) ) );
	}
}

class T_Wpdb {
	public $prefix = 'wp_'; public $rows = array();
	public function prepare( $sql, ...$args ) { return json_encode( array( $sql, $args ) ); }
	public function query( $q ) {
		list( , $a ) = json_decode( $q, true );
		foreach ( $this->rows as $r ) {
			if ( $r[0] === $a[0] || ( null !== $a[1] && $r[1] === $a[1] && $r[2] === $a[2] ) ) {
				return 0;
			}
		}
		$this->rows[] = $a;
		return 1;
	}
	public function delete( $t, $w ) { $this->rows = array_values( array_filter( $this->rows, fn( $r ) => $r[0] !== $w['delivery_id'] ) ); }
}
$GLOBALS['wpdb'] = new T_Wpdb();
