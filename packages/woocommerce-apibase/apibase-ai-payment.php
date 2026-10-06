<?php
/**
 * Plugin Name: APIbase AI payment for WooCommerce
 * Plugin URI:  https://apibase.pro/integrator/platforms/woocommerce
 * Description: Lets AI agents buy from your store: syncs the catalog to APIbase, adds a "Buy with your AI agent" link, and turns paid APIbase orders into WooCommerce orders. No JavaScript is added to your site.
 * Version:     1.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author:      APIbase
 * Author URI:  https://apibase.pro
 * License:     GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: apibase-ai-payment
 *
 * @package apibase-ai-payment
 *
 * This program is free software; you can redistribute it and/or modify it under the terms of the
 * GNU General Public License as published by the Free Software Foundation; either version 2 of the
 * License, or (at your option) any later version.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'APIBASE_PLUGIN_VERSION', '1.0.0' );
define( 'APIBASE_PLUGIN_DIR', __DIR__ . '/' );
define( 'APIBASE_BASE_URL', 'https://apibase.pro' );

foreach ( array( 'crypto', 'settings', 'signature', 'deliveries', 'webhook', 'catalog', 'api', 'sync', 'storefront', 'callbacks', 'bootstrap' ) as $apibase_part ) {
	require_once APIBASE_PLUGIN_DIR . 'includes/' . $apibase_part . '.php';
}

register_activation_hook( __FILE__, array( 'Apibase_Deliveries', 'install' ) );
Apibase_Bootstrap::register();
