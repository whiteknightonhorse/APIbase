<?php
/**
 * Removes every trace of the plugin when it is deleted from the Plugins screen.
 *
 * @package apibase-ai-payment
 * @license GPL-2.0-or-later
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;

delete_option( 'apibase_settings' );
delete_option( 'apibase_sync_queue' );
delete_option( 'apibase_sync_report' );
delete_option( 'apibase_db_version' );
// phpcs:ignore WordPress.DB.DirectDatabaseQuery
$wpdb->query( 'DROP TABLE IF EXISTS ' . $wpdb->prefix . 'apibase_deliveries' );
if ( function_exists( 'as_unschedule_all_actions' ) ) {
	as_unschedule_all_actions( 'apibase_sync_batch' );
}
