# WooCommerce: add AI payment

For a WooCommerce store. The GPL-2.0-or-later plugin "APIbase AI payment for WooCommerce" does the work: it syncs your catalog, adds the link to product pages and turns paid orders into WooCommerce orders. It adds no JavaScript to your site and talks only to `https://apibase.pro`. First connect your shop at /integrator/connect (or with your agent: /integrator/agent-guide) and note your `<slug>`, your `mk_live_` key and your `whsec_` webhook secret.

## Install

1. Download `woocommerce-apibase.zip`.
2. In WordPress open Plugins, Add New, Upload Plugin, choose the zip, install and activate.
3. Open WooCommerce, Settings, AI payment.

## Settings

- Merchant slug, the `mk_live_` API key and the `whsec_` webhook secret. Both secrets are stored encrypted (AES-256-GCM) and shown masked.
- Switches: the button at the product, the machine-readable markup, and `/.well-known/apibase-merchant.txt` for the domain check.
- Category mapping: each WooCommerce category maps to an APIbase category; products in unmapped categories are skipped with a note.
- Prices are USD only: if the store currency is not USD, catalog sync is switched off and the page says so.
- Register `https://<your-store>/wp-json/apibase/v1/webhook` as your webhook endpoint at APIbase.

## What the plugin does

- Sync: product changes go to a queue and are sent in batches of up to 500 products. Simple virtual or downloadable products are delivered by the merchant, simple physical products carry the flat-rate shipping options of your zones, variable products become variants. Deleting a product removes it from the catalog. The button Sync now and the report of the last sync (accepted and rejected, with the reasons from the API) are on the settings page.
- Link and markup: on each product page a "Buy with your AI agent" link to `https://apibase.pro/m/<slug>/p/<sku>`, a `<link rel="alternate">` to your agent.json and schema.org BuyAction markup. No script.
- Orders: every paid APIbase order becomes a WooCommerce order (status processing for physical goods, completed for virtual ones) with the payment method "AI payment — APIbase". The webhook signature is checked and every delivery is handled once. Downloadable files are delivered in the webhook answer.
- Callbacks: completing a WooCommerce order confirms it at APIbase; with a tracking number it marks the order shipped.
- Refunds: a refund in WooCommerce leaves a note with the amount and the buyer wallet. You send the USDC yourself, paste the transaction hash into the box on the order, and the plugin passes it to APIbase. The plugin never sends crypto.

## No plugin

The links still work without the plugin. Paste link A, `https://apibase.pro/m/<slug>/p/<sku>`, into a product description (Text tab), or the shop link `https://apibase.pro/m/<slug>` into a home page block. Use the link text "Buy with your AI agent". Ready-made markup: /integrator#options.

Check the result at `/integrator/check/<slug>`.
