<?php
/**
 * Wires every module to WordPress once WooCommerce is loaded.
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

class Apibase_Bootstrap {
	public static function register() {
		add_action( 'plugins_loaded', array( __CLASS__, 'boot' ), 20 );
	}

	public static function boot() {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return;
		}
		Apibase_Settings::register();
		Apibase_Sync::register();
		Apibase_Storefront::register();
		Apibase_Callbacks::register();
		add_action( 'rest_api_init', array( 'Apibase_Webhook', 'register' ) );
	}
}
