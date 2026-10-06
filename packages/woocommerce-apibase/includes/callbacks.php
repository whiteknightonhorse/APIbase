<?php
/**
 * Order callbacks: Woo completed -> confirm / ship; Woo refund -> note + tx_hash form -> POST /refunds. The plugin never sends crypto.
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

class Apibase_Callbacks {
	public static function register() {
		add_action( 'woocommerce_order_status_completed', array( __CLASS__, 'on_completed' ) );
		add_action( 'woocommerce_order_refunded', array( __CLASS__, 'on_refunded' ), 10, 2 );
		add_action( 'add_meta_boxes', array( __CLASS__, 'meta_box' ) );
		add_action( 'admin_post_apibase_refund_hash', array( __CLASS__, 'submit_refund' ) );
	}

	/** First non-empty tracking meta of the popular tracking plugins. */
	public static function tracking( $order ) {
		$number = (string) $order->get_meta( '_tracking_number' );
		if ( '' === $number ) {
			return null;
		}
		$carrier = (string) $order->get_meta( '_tracking_provider' );
		return array( 'carrier' => '' === $carrier ? 'other' : $carrier, 'number' => $number );
	}

	public static function on_completed( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order || '' === (string) $order->get_meta( '_apibase_order_id' ) || $order->get_meta( '_apibase_synced' ) ) {
			return;
		}
		$id = rawurlencode( (string) $order->get_meta( '_apibase_order_id' ) );
		$tr = self::tracking( $order );
		$r  = $tr
			? Apibase_Api::request( 'POST', '/orders/' . $id . '/ship', array( 'tracking' => $tr ) )
			: Apibase_Api::request( 'POST', '/orders/' . $id . '/confirm', array() );
		if ( 200 === $r['status'] ) {
			$order->update_meta_data( '_apibase_synced', $tr ? 'shipped' : 'confirmed' );
			$order->save();
			$order->add_order_note( $tr ? 'APIbase: marked as shipped.' : 'APIbase: marked as confirmed.' );
		} else {
			$order->add_order_note( 'APIbase: could not update the order (HTTP ' . (int) $r['status'] . ').' );
		}
	}

	public static function on_refunded( $order_id, $refund_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order || '' === (string) $order->get_meta( '_apibase_order_id' ) ) {
			return;
		}
		$refund = wc_get_order( $refund_id );
		$amount = $refund ? number_format( abs( (float) $refund->get_amount() ), 2, '.', '' ) : '';
		$r      = Apibase_Api::request( 'GET', '/orders/' . rawurlencode( (string) $order->get_meta( '_apibase_order_id' ) ) );
		$wallet = ( 200 === $r['status'] && is_array( $r['body'] ) && ! empty( $r['body']['payer_wallet'] ) ) ? (string) $r['body']['payer_wallet'] : '(unavailable: open the order in your APIbase dashboard)';
		$order->update_meta_data( '_apibase_refund_amount', $amount );
		$order->save();
		$order->add_order_note( 'APIbase refund: send ' . $amount . ' USDC to ' . $wallet . ' yourself, then paste the transaction hash in the "APIbase refund" box on this order. This plugin never sends crypto.' );
	}

	public static function meta_box() {
		add_meta_box( 'apibase_refund', 'APIbase refund', array( __CLASS__, 'render_box' ), 'shop_order', 'side' );
		add_meta_box( 'apibase_refund', 'APIbase refund', array( __CLASS__, 'render_box' ), 'woocommerce_page_wc-orders', 'side' );
	}

	public static function render_box( $post_or_order ) {
		$order = wc_get_order( is_object( $post_or_order ) && isset( $post_or_order->ID ) ? $post_or_order->ID : $post_or_order );
		if ( ! $order || '' === (string) $order->get_meta( '_apibase_order_id' ) ) {
			echo esc_html( 'Not an APIbase order.' );
			return;
		}
		echo '<form method="post" action="' . esc_url( admin_url( 'admin-post.php' ) ) . '">';
		echo '<input type="hidden" name="action" value="apibase_refund_hash" />';
		echo '<input type="hidden" name="order_id" value="' . (int) $order->get_id() . '" />';
		wp_nonce_field( 'apibase_refund_hash' );
		echo '<p><label>Amount (USDC) <input type="text" name="amount" value="' . esc_attr( (string) $order->get_meta( '_apibase_refund_amount' ) ) . '" /></label></p>';
		echo '<p><label>Transaction hash <input type="text" name="tx_hash" placeholder="0x..." /></label></p>';
		echo '<p><button class="button">' . esc_html( 'Send to APIbase' ) . '</button></p></form>';
	}

	public static function submit_refund() {
		if ( ! current_user_can( 'manage_woocommerce' ) ) {
			wp_die( 'Not allowed.', 403 );
		}
		check_admin_referer( 'apibase_refund_hash' );
		$order = wc_get_order( isset( $_POST['order_id'] ) ? (int) $_POST['order_id'] : 0 );
		$hash  = isset( $_POST['tx_hash'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['tx_hash'] ) ) ) : '';
		$amt   = isset( $_POST['amount'] ) ? preg_replace( '/[^0-9.]/', '', wp_unslash( $_POST['amount'] ) ) : '';
		if ( $order && preg_match( '/^0x[0-9a-fA-F]{64}$/', $hash ) && '' !== $amt ) {
			$r = Apibase_Api::request(
				'POST',
				'/refunds',
				array(
					'order_id' => (string) $order->get_meta( '_apibase_order_id' ),
					'amount'   => $amt,
					'tx_hash'  => $hash,
				)
			);
			$order->add_order_note( 200 === $r['status'] ? 'APIbase: refund transaction submitted for verification.' : 'APIbase: refund was not accepted (HTTP ' . (int) $r['status'] . ').' );
		}
		wp_safe_redirect( wp_get_referer() ? wp_get_referer() : admin_url() );
		exit;
	}
}
