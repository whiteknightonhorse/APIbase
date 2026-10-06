<?php
/**
 * Plain-assert test runner (WC2-WC7). Run: php tests/run.php. No composer, no WordPress.
 *
 * @package apibase-ai-payment
 * @license GPL-2.0-or-later
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 */

require __DIR__ . '/stubs.php';
define( 'APIBASE_PLUGIN_DIR', dirname( __DIR__ ) . '/' );
define( 'APIBASE_BASE_URL', 'https://apibase.pro' );
foreach ( array( 'crypto', 'settings', 'signature', 'deliveries', 'webhook', 'catalog', 'api', 'sync', 'storefront', 'callbacks', 'bootstrap' ) as $part ) {
	require APIBASE_PLUGIN_DIR . 'includes/' . $part . '.php';
}

$fails = 0;
$count = 0;
function check( $name, $cond ) {
	global $fails, $count;
	++$count;
	if ( in_array( '--dump-catalog', $GLOBALS['argv'], true ) ) {
		return;
	}
	if ( ! $cond ) {
		++$fails;
		echo "FAIL $name\n";
	} else {
		echo "ok   $name\n";
	}
}
function reset_world() {
	$GLOBALS['t_options']  = array();
	$GLOBALS['t_orders']   = array();
	$GLOBALS['t_http']     = array();
	$GLOBALS['t_currency'] = 'USD';
	$GLOBALS['wpdb']       = new T_Wpdb();
}
function configure() {
	Apibase_Settings::save(
		array(
			'apibase_slug'   => 'acme',
			'apibase_key'    => 'mk_live_' . str_repeat( 'a', 32 ),
			'apibase_whsec'  => 'whsec_' . str_repeat( 'b', 32 ),
			'apibase_flag_button' => '1', 'apibase_flag_markup' => '1', 'apibase_flag_wellknown' => '1',
			'apibase_catmap' => array( 5 => 'books', 6 => 'software', 7 => 'electronics' ),
		)
	);
}
function signed( $secret, $t, $body ) {
	return 't=' . $t . ',v1=' . hash_hmac( 'sha256', $t . '.' . $body, $secret );
}
$now = 1800000000;
$sec = 'whsec_' . str_repeat( 'b', 32 );

// WC2 signature: fixture produced by the TypeScript signer (INT-14), verified here.
$fx = json_decode( (string) @file_get_contents( __DIR__ . '/fixtures/signature.json' ), true ) ?: array( 'header' => '', 'body' => 'xxxx', 'secret' => '', 't' => 0 );
check( 'WC2 fixture signature verifies', Apibase_Signature::verify( $fx['header'], $fx['body'], $fx['secret'], $fx['t'] ) );
$bytes = $fx['body'];
$bytes[3] = 'X' === $bytes[3] ? 'Y' : 'X';
check( 'WC2 one changed byte is refused', ! Apibase_Signature::verify( $fx['header'], $bytes, $fx['secret'], $fx['t'] ) );
check( 'WC2 t older than 300 s is refused', ! Apibase_Signature::verify( $fx['header'], $fx['body'], $fx['secret'], $fx['t'] + 301 ) );
check( 'WC2 t in the future by more than 300 s is refused', ! Apibase_Signature::verify( $fx['header'], $fx['body'], $fx['secret'], $fx['t'] - 301 ) );
check( 'WC2 t exactly 300 s old is accepted', Apibase_Signature::verify( $fx['header'], $fx['body'], $fx['secret'], $fx['t'] + 300 ) );
check( 'WC2 wrong secret is refused', ! Apibase_Signature::verify( $fx['header'], $fx['body'], 'whsec_other', $fx['t'] ) );
check( 'WC2 garbage header is refused', ! Apibase_Signature::verify( 'nonsense', $fx['body'], $fx['secret'], $fx['t'] ) );

// Products used by the order and catalog tests.
$GLOBALS['t_products'] = array(
	10 => new T_Product( array( 'id' => 10, 'sku' => 'EBOOK-1', 'name' => 'E-book', 'price' => '9.9', 'virtual' => true, 'downloadable' => true, 'downloads' => array( 'dl1' => 'x' ), 'cats' => array( 5 ), 'desc' => '<p>Read <b>me</b></p>', 'img' => 3 ) ),
	11 => new T_Product( array( 'id' => 11, 'sku' => 'MUG-1', 'name' => 'Mug', 'price' => '12.00', 'stock' => 4, 'cats' => array( 7 ), 'short' => 'A mug' ) ),
	12 => new T_Product( array( 'id' => 12, 'sku' => 'TEE', 'name' => 'T-shirt', 'price' => '20', 'type' => 'variable', 'children' => array( 13, 14 ), 'cats' => array( 7 ) ) ),
	13 => new T_Product( array( 'id' => 13, 'sku' => 'TEE-S', 'name' => 'T-shirt S', 'price' => '20', 'stock' => 2, 'attrs' => array( 'attribute_size' => 'S' ) ) ),
	14 => new T_Product( array( 'id' => 14, 'sku' => '', 'name' => 'T-shirt L', 'price' => '22.5', 'attrs' => array( 'attribute_size' => 'L' ) ) ),
	15 => new T_Product( array( 'id' => 15, 'sku' => 'NOCAT', 'name' => 'Uncategorised', 'price' => '5', 'cats' => array( 99 ) ) ),
);

function paid_body( $order_id, array $skus, array $extra = array() ) {
	$items = array();
	foreach ( $skus as $s ) {
		$items[] = array( 'sku' => $s, 'quantity' => 1 );
	}
	return json_encode( array( 'id' => 'ob1', 'event' => 'order.paid', 'created_at' => '2026-10-06T00:00:00Z', 'data' => array_merge( array( 'order_id' => $order_id, 'tx_hash' => '0x' . str_repeat( 'c', 64 ), 'rail' => 'base', 'payer_wallet' => '0xAbCdEf1234567890', 'items' => $items ), $extra ) ) );
}
function deliver( $body, $delivery_id, $now ) {
	global $sec;
	return Apibase_Webhook::handle( $body, array( 'signature' => signed( $sec, $now, $body ), 'delivery_id' => $delivery_id ), $now );
}

// WC3 de-duplication.
reset_world();
configure();
$b1 = paid_body( 'order-1', array( 'MUG-1' ) );
$r1 = deliver( $b1, 'D1', $now );
$r2 = deliver( $b1, 'D1', $now );
check( 'WC3 same Delivery-Id twice -> one order', 1 === count( $GLOBALS['t_orders'] ) && 200 === $r1['status'] && 200 === $r2['status'] );
$r3 = deliver( $b1, 'D2', $now );
check( 'WC3 same order_id, other Delivery-Id -> still one order', 1 === count( $GLOBALS['t_orders'] ) && 200 === $r3['status'] );
$bd = paid_body( 'order-2', array( 'EBOOK-1' ) );
$ra = deliver( $bd, 'D3', $now );
$rb = deliver( $bd, 'D3', $now );
check( 'WC3 repeat delivery carries no second fulfillment', isset( $ra['body']['fulfillment'] ) && ! isset( $rb['body']['fulfillment'] ) && 2 === count( $GLOBALS['t_orders'] ) );
check( 'WC3 bad signature creates nothing', 401 === Apibase_Webhook::handle( paid_body( 'order-9', array( 'MUG-1' ) ), array( 'signature' => 't=' . $now . ',v1=00', 'delivery_id' => 'D9' ), $now )['status'] && 2 === count( $GLOBALS['t_orders'] ) );

// WC4 order.paid with two lines.
reset_world();
configure();
$body = paid_body( 'order-3', array( 'MUG-1', 'EBOOK-1' ), array( 'pii' => array( array( 'enc' => 'sealed-envelope' ) ) ) );
$r    = deliver( $body, 'D4', $now );
$o    = $GLOBALS['t_orders'][1];
check( 'WC4 two lines', 2 === count( $o->lines ) );
check( 'WC4 mixed cart with a physical line -> processing', 'processing' === $o->status );
check( 'WC4 payment method', 'apibase_ai_payment' === $o->method && 'AI payment — APIbase' === $o->title );
check( 'WC4 meta present', 'order-3' === $o->get_meta( '_apibase_order_id' ) && '0x' . str_repeat( 'c', 64 ) === $o->get_meta( '_apibase_tx_hash' ) && 'base' === $o->get_meta( '_apibase_rail' ) && '0xAbCdEf' === substr( $o->get_meta( '_apibase_payer_prefix' ), 0, 8 ) && 8 === strlen( $o->get_meta( '_apibase_payer_prefix' ) ) );
check( 'WC4 PII envelope kept sealed as received', false !== strpos( $o->get_meta( '_apibase_pii_envelopes' ), 'sealed-envelope' ) );
check( 'WC4 synthetic e-mail', 'order-order-3@agent.invalid' === $o->email );
check( 'WC4 downloadable -> fulfillment.urls', 'url' === $r['body']['fulfillment']['type'] && 1 === count( $r['body']['fulfillment']['urls'] ) );
reset_world();
configure();
$r = deliver( paid_body( 'order-4', array( 'MUG-1' ) ), 'D5', $now );
check( 'WC4 physical -> no fulfillment', ! isset( $r['body']['fulfillment'] ) && 'processing' === $GLOBALS['t_orders'][1]->status );
reset_world();
configure();
$r = deliver( paid_body( 'order-5', array( 'EBOOK-1' ) ), 'D6', $now );
check( 'WC4 all-virtual -> completed', 'completed' === $GLOBALS['t_orders'][1]->status );
$rc = deliver( json_encode( array( 'event' => 'order.cancelled', 'data' => array( 'order_id' => 'order-5' ) ) ), 'D7', $now );
check( 'WC4 order.cancelled adds a note', 200 === $rc['status'] && 1 === count( $GLOBALS['t_orders'][1]->notes ) );
$rf = deliver( json_encode( array( 'event' => 'refund.requested', 'data' => array( 'order_id' => 'order-5', 'amount' => '9.90' ) ) ), 'D8', $now );
check( 'WC4 refund.requested adds a note', 2 === count( $GLOBALS['t_orders'][1]->notes ) );
$ru = deliver( paid_body( 'order-6', array( 'NOPE' ) ), 'D10', $now );
check( 'WC4 unknown SKU -> 500 and the claim is released for the retry', 500 === $ru['status'] && 0 === count( array_filter( $GLOBALS['wpdb']->rows, fn( $x ) => 'D10' === $x[0] ) ) );

// WC5 catalog mapping.
reset_world();
configure();
$cmap = Apibase_Settings::get( 'category_map' );
$ship = Apibase_Catalog::shipping_options();
$out  = array();
$skip = array();
foreach ( array( 10, 11, 12, 15 ) as $id ) {
	$m = Apibase_Catalog::map( $GLOBALS['t_products'][ $id ], $cmap, $ship );
	if ( $m['item'] ) {
		$out[] = $m['item'];
	} else {
		$skip[] = $m['sku'];
	}
}
if ( in_array( '--dump-catalog', $argv, true ) ) {
	echo json_encode( $out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES ) . "\n";
	exit( 0 );
}
$expected = json_decode( file_get_contents( __DIR__ . '/fixtures/catalog-expected.json' ), true );
check( 'WC5 mapped catalog equals the fixture', json_decode( json_encode( $out ), true ) === $expected );
check( 'WC5 unmapped category is skipped with a reason', array( 'NOCAT' ) === $skip );
check( 'WC5 downloadable -> merchant, physical -> physical', 'merchant' === $out[0]['fulfillment_mode'] && 'physical' === $out[1]['fulfillment_mode'] && 'DE' === $out[1]['shipping_options'][0]['regions'][0] );
check( 'WC5 description has no tags', false === strpos( $out[0]['description'], '<' ) );
check( 'WC5 variable -> variants[] with a derived SKU', 2 === count( $out[2]['variants'] ) && 'TEE-14' === $out[2]['variants'][1]['sku'] );
$GLOBALS['t_currency'] = 'EUR';
update_option( 'apibase_sync_queue', array() );
Apibase_Sync::on_change( 10 );
Apibase_Sync::run_batch();
check( 'WC5 non-USD store: sync disabled, nothing sent, nothing queued', ! Apibase_Settings::currency_ok() && ! Apibase_Settings::sync_enabled() && array() === $GLOBALS['t_http'] && array() === get_option( 'apibase_sync_queue' ) );
$GLOBALS['t_currency'] = 'USD';
Apibase_Sync::on_change( 10 );
$GLOBALS['t_http_res'] = array( 'code' => 200, 'body' => json_encode( array( 'upserted' => 1, 'rejected' => array( array( 'sku' => 'X', 'reason' => 'price' ) ), 'errors' => array() ) ) );
Apibase_Sync::run_batch();
$rep = get_option( 'apibase_sync_report' );
check( 'WC5 USD store: one PUT /catalog to apibase.pro, report recorded', 1 === count( $GLOBALS['t_http'] ) && 'PUT' === $GLOBALS['t_http'][0]['args']['method'] && 0 === strpos( $GLOBALS['t_http'][0]['url'], 'https://apibase.pro/api/v1/shop/merchants/me/catalog' ) && 1 === $rep['upserted'] && 'price' === $rep['rejected'][0]['reason'] );
check( 'WC5 API key sent as a Bearer mk_live_ token', 'Bearer mk_live_' . str_repeat( 'a', 32 ) === $GLOBALS['t_http'][0]['args']['headers']['Authorization'] );

// WC6 storefront output.
reset_world();
configure();
$GLOBALS['t_products'][1] = new T_Product( array( 'id' => 1, 'sku' => 'EBOOK-1', 'name' => 'E-book', 'price' => '9.90' ) );
ob_start();
Apibase_Storefront::print_button();
Apibase_Storefront::print_head();
$html = ob_get_clean();
check( 'WC6 link A', false !== strpos( $html, 'href="https://apibase.pro/m/acme/p/EBOOK-1"' ) || false !== strpos( $html, 'href="https://apibase.pro/m/acme/p/' ) );
check( 'WC6 link A attributes', false !== strpos( $html, 'rel="alternate payment"' ) && false !== strpos( $html, 'class="apibase-ai-buy"' ) && false !== strpos( $html, '>Buy with your AI agent</a>' ) );
check( 'WC6 <link rel=alternate>', false !== strpos( $html, '<link rel="alternate" type="application/json" href="https://apibase.pro/m/acme/agent.json"' ) );
check( 'WC6 JSON-LD BuyAction', false !== strpos( $html, '"@type":"BuyAction"' ) && false !== strpos( $html, 'https://apibase.pro/mcp/m/acme' ) );
$no_ld = preg_replace( '#<script type="application/ld\+json">.*?</script>#s', '', $html );
check( 'WC6 no <script> other than the JSON-LD data block', false === strpos( $no_ld, '<script' ) && 1 === substr_count( $html, '<script' ) );
$src = '';
foreach ( glob( APIBASE_PLUGIN_DIR . 'includes/*.php' ) as $f ) {
	$src .= file_get_contents( $f );
}
check( 'WC6 plugin source contains no script src and no external host but apibase.pro', false === stripos( $src, '<script src' ) && false === stripos( $src, 'wp_enqueue_script' ) && 0 === preg_match( '#https?://(?=[a-z0-9])(?!apibase\.pro|www\.gnu\.org)#', preg_replace( '#https://schema\.org#', '', $src ) ) );

// WC7 secrets at rest.
$raw = serialize( get_option( 'apibase_settings' ) );
check( 'WC7 no plain mk_live_ key in wp_options', 0 === preg_match( '/mk_live_[0-9a-f]{32}/', $raw ) );
check( 'WC7 no plain whsec_ secret in wp_options', 0 === preg_match( '/whsec_[0-9a-f]{32}/', $raw ) );
check( 'WC7 secrets round-trip', 'mk_live_' . str_repeat( 'a', 32 ) === Apibase_Settings::api_key() && $sec === Apibase_Settings::webhook_secret() );
check( 'WC7 mask hides the middle', 'mk_live_********aaaa' === Apibase_Crypto::mask( Apibase_Settings::api_key() ) );
check( 'WC7 tampered ciphertext does not decrypt', '' === Apibase_Crypto::decrypt( substr( Apibase_Settings::get( 'mk_enc' ), 0, -3 ) . 'AAA' ) );

echo "\n$count checks, $fails failed\n";
exit( $fails ? 1 : 0 );
