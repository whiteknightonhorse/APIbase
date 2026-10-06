<?php
/**
 * X-APIbase-Signature check: t=<unix>,v1=HMAC-SHA256(secret, t . "." . raw_body) (F-6).
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

class Apibase_Signature {
	const TOLERANCE = 300;

	/**
	 * @param string $header Raw X-APIbase-Signature value.
	 * @param string $body   Raw request body, byte for byte.
	 * @param string $secret whsec_ secret.
	 * @param int    $now    Current unix time.
	 */
	public static function verify( $header, $body, $secret, $now ) {
		if ( '' === $secret || ! is_string( $header ) ) {
			return false;
		}
		$t  = null;
		$v1 = null;
		foreach ( explode( ',', $header ) as $part ) {
			$kv = explode( '=', trim( $part ), 2 );
			if ( 2 === count( $kv ) && 't' === $kv[0] ) {
				$t = $kv[1];
			} elseif ( 2 === count( $kv ) && 'v1' === $kv[0] ) {
				$v1 = $kv[1];
			}
		}
		if ( null === $t || null === $v1 || ! ctype_digit( $t ) ) {
			return false;
		}
		if ( abs( $now - (int) $t ) > self::TOLERANCE ) {
			return false;
		}
		$expected = hash_hmac( 'sha256', $t . '.' . $body, $secret );
		return hash_equals( $expected, $v1 );
	}
}
