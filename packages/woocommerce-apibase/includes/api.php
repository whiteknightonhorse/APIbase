<?php
/**
 * The only outbound HTTP of the plugin: wp_remote_* to https://apibase.pro with the merchant key.
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

class Apibase_Api {
	/**
	 * @param string     $method GET, POST, PUT or DELETE.
	 * @param string     $path   Path below /api/v1/shop/merchants/me.
	 * @param array|null $body   JSON body.
	 * @return array{status:int, body:mixed}
	 */
	public static function request( $method, $path, $body = null ) {
		$key = Apibase_Settings::api_key();
		if ( '' === $key ) {
			return array( 'status' => 0, 'body' => array( 'error' => 'no API key configured' ) );
		}
		$args = array(
			'method'  => $method,
			'timeout' => 20,
			'headers' => array(
				'Authorization' => 'Bearer ' . $key,
				'Content-Type'  => 'application/json',
				'Accept'        => 'application/json',
			),
		);
		if ( null !== $body ) {
			$args['body'] = wp_json_encode( $body );
		}
		$res = wp_remote_request( APIBASE_BASE_URL . '/api/v1/shop/merchants/me' . $path, $args );
		if ( is_wp_error( $res ) ) {
			return array( 'status' => 0, 'body' => array( 'error' => $res->get_error_message() ) );
		}
		return array(
			'status' => (int) wp_remote_retrieve_response_code( $res ),
			'body'   => json_decode( (string) wp_remote_retrieve_body( $res ), true ),
		);
	}
}
