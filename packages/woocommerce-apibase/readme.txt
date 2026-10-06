=== APIbase AI payment for WooCommerce ===
Contributors: apibase
Tags: woocommerce, ai, agents, usdc, payments
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Let AI agents buy from your WooCommerce store. Catalog sync, a "Buy with your AI agent" link, and paid APIbase orders as WooCommerce orders. No JavaScript is added to your site.

== Description ==

APIbase lets an AI agent find your products and pay for them in USDC. This plugin connects your store:

* Syncs your catalog (USD prices only) to APIbase in batches of up to 500 products.
* Adds a "Buy with your AI agent" link on product pages, a `<link rel="alternate">` and schema.org BuyAction markup. There is no JavaScript.
* Receives signed webhooks and creates a WooCommerce order for every paid APIbase order. Downloadable products are delivered in the webhook response.
* Reports order confirmation and shipping back to APIbase. For refunds it shows what to send and where; you send the USDC yourself and paste the transaction hash. The plugin never sends crypto.

The plugin talks only to https://apibase.pro. No CDN, no telemetry, no external assets. The API key and webhook secret are stored encrypted (AES-256-GCM).

Fee: 0% fee during the pilot.

== Installation ==

1. Upload the zip in Plugins, Add New, Upload Plugin, and activate it.
2. Open WooCommerce, Settings, AI payment.
3. Enter your merchant slug, your `mk_live_` key and your `whsec_` webhook secret.
4. Map your product categories to APIbase categories and press Sync now.
5. Register `https://your-store/wp-json/apibase/v1/webhook` as a webhook endpoint at APIbase.

== Frequently Asked Questions ==

= My store currency is not USD =
Catalog sync is switched off: APIbase prices are USD only.

= Where is the source? =
This plugin is public GPL code, see https://apibase.pro/integrator/platforms/woocommerce.

== Changelog ==

= 1.0.0 =
* First release.
