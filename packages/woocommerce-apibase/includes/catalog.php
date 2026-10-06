<?php
/**
 * WooCommerce product -> APIbase catalog item (INT-06 / F-2 schema).
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

class Apibase_Catalog {
	const BATCH = 500;

	public static function allowed_categories() {
		$j = json_decode( (string) file_get_contents( APIBASE_PLUGIN_DIR . 'data/allowed-categories.json' ), true );
		return is_array( $j ) ? $j : array();
	}

	private static function usd( $v ) {
		return number_format( (float) $v, 2, '.', '' );
	}

	private static function images( $product ) {
		$out = array();
		$ids = array_merge( array( $product->get_image_id() ), (array) $product->get_gallery_image_ids() );
		foreach ( $ids as $id ) {
			$url = $id ? wp_get_attachment_url( $id ) : '';
			if ( is_string( $url ) && 0 === strpos( $url, 'https://' ) ) {
				$out[] = $url;
			}
		}
		return array_slice( $out, 0, 10 );
	}

	private static function category( $product, array $map ) {
		foreach ( (array) $product->get_category_ids() as $term_id ) {
			if ( isset( $map[ $term_id ] ) ) {
				return $map[ $term_id ];
			}
		}
		return null;
	}

	/** Flat-rate methods of every zone: one option per (zone, method), regions = the zone countries. */
	public static function shipping_options() {
		$out = array();
		foreach ( WC_Shipping_Zones::get_zones() as $zone ) {
			$regions = array();
			foreach ( $zone['zone_locations'] as $loc ) {
				if ( 'country' === $loc->type ) {
					$regions[] = $loc->code;
				}
			}
			foreach ( $zone['shipping_methods'] as $m ) {
				if ( 'flat_rate' !== $m->id || 'yes' !== $m->enabled ) {
					continue;
				}
				$opt = array(
					'id'       => 'zone' . $zone['id'] . '-' . $m->get_instance_id(),
					'label'    => substr( (string) $zone['zone_name'], 0, 120 ),
					'price_usd' => self::usd( $m->get_option( 'cost', 0 ) ),
				);
				if ( $regions ) {
					$opt['regions'] = $regions;
				}
				$out[] = $opt;
			}
		}
		return array_slice( $out, 0, 20 );
	}

	/**
	 * @return array{item:?array, skip:?string} item is the catalog row, skip is the reason it is left out.
	 */
	public static function map( $product, array $map, array $shipping ) {
		$sku = (string) $product->get_sku();
		if ( ! preg_match( '/^[A-Za-z0-9._:-]{1,64}$/', $sku ) ) {
			return array( 'item' => null, 'skip' => 'product has no valid SKU (letters, digits, . _ : - up to 64)', 'sku' => $sku );
		}
		$cat = self::category( $product, $map );
		if ( null === $cat ) {
			return array( 'item' => null, 'skip' => 'category is not mapped to an allowed APIbase category', 'sku' => $sku );
		}
		$desc = wp_strip_all_tags( (string) ( $product->get_description() ? $product->get_description() : $product->get_short_description() ) );
		$item = array(
			'sku'         => $sku,
			'title'       => substr( wp_strip_all_tags( $product->get_name() ), 0, 120 ),
			'description' => substr( $desc, 0, 2000 ),
			'price_usd'   => self::usd( $product->get_price() ),
			'stock'       => $product->managing_stock() ? max( 0, (int) $product->get_stock_quantity() ) : null,
			'images'      => self::images( $product ),
			'category'    => $cat,
		);
		if ( $product->is_virtual() || $product->is_downloadable() ) {
			$item['fulfillment_mode'] = 'merchant';
		} else {
			$item['fulfillment_mode'] = 'physical';
			if ( $shipping ) {
				$item['shipping_options'] = $shipping;
			}
		}
		if ( $product->is_type( 'variable' ) ) {
			$variants = array();
			$prices   = array();
			foreach ( $product->get_children() as $vid ) {
				$v = wc_get_product( $vid );
				if ( ! $v ) {
					continue;
				}
				$vsku = (string) $v->get_sku();
				$vsku = '' === $vsku ? substr( $sku . '-' . $vid, 0, 64 ) : $vsku;
				$row  = array(
					'sku'       => $vsku,
					'title'     => substr( wp_strip_all_tags( $v->get_name() ), 0, 120 ),
					'price_usd' => self::usd( $v->get_price() ),
					'stock'     => $v->managing_stock() ? max( 0, (int) $v->get_stock_quantity() ) : null,
				);
				$attr = array();
				foreach ( (array) $v->get_variation_attributes() as $k => $val ) {
					$attr[ substr( preg_replace( '/^attribute_/', '', (string) $k ), 0, 60 ) ] = substr( (string) $val, 0, 200 );
				}
				if ( $attr ) {
					$row['attributes'] = $attr;
				}
				$variants[] = $row;
				$prices[]   = (float) $v->get_price();
			}
			if ( $variants ) {
				$item['variants']  = array_slice( $variants, 0, 100 );
				$item['price_usd'] = self::usd( min( $prices ) );
			}
		}
		return array( 'item' => $item, 'skip' => null, 'sku' => $sku );
	}
}
