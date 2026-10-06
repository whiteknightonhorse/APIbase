<?php
/**
 * wp_apibase_deliveries: one row per handled delivery id and per (order_id, event); the claim is an atomic insert.
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

class Apibase_Deliveries {
	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'apibase_deliveries';
	}

	public static function install() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$t = self::table();
		dbDelta(
			"CREATE TABLE {$t} (
			delivery_id varchar(64) NOT NULL,
			order_id varchar(64) NULL,
			event varchar(40) NOT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (delivery_id),
			UNIQUE KEY order_event (order_id, event)
			) {$wpdb->get_charset_collate()};"
		);
		update_option( 'apibase_db_version', '1' );
	}

	/**
	 * Atomically records the delivery. False when this Delivery-Id, or this order_id for this event,
	 * was already handled.
	 */
	public static function claim( $delivery_id, $order_id, $event ) {
		global $wpdb;
		$sql  = $wpdb->prepare(
			'INSERT IGNORE INTO ' . self::table() . ' (delivery_id, order_id, event, created_at) VALUES (%s, %s, %s, %s)',
			$delivery_id,
			$order_id,
			$event,
			gmdate( 'Y-m-d H:i:s' )
		);
		$rows = $wpdb->query( $sql );
		return 1 === (int) $rows;
	}

	/** Gives the claim back, so a failed handling is retried by the next delivery attempt. */
	public static function release( $delivery_id ) {
		global $wpdb;
		$wpdb->delete( self::table(), array( 'delivery_id' => $delivery_id ) );
	}
}
