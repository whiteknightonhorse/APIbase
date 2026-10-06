<?php
/**
 * AES-256-GCM sealing of the two stored secrets (key derived from wp_salt('auth')).
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

class Apibase_Crypto {
	const PREFIX = 'v1:';

	private static function key() {
		return hash( 'sha256', wp_salt( 'auth' ), true );
	}

	public static function encrypt( $plain ) {
		$iv  = random_bytes( 12 );
		$tag = '';
		$ct  = openssl_encrypt( $plain, 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, $iv, $tag, '', 16 );
		if ( false === $ct ) {
			return '';
		}
		return self::PREFIX . base64_encode( $iv . $tag . $ct );
	}

	public static function decrypt( $sealed ) {
		if ( ! is_string( $sealed ) || 0 !== strpos( $sealed, self::PREFIX ) ) {
			return '';
		}
		$raw = base64_decode( substr( $sealed, strlen( self::PREFIX ) ), true );
		if ( false === $raw || strlen( $raw ) < 29 ) {
			return '';
		}
		$plain = openssl_decrypt( substr( $raw, 28 ), 'aes-256-gcm', self::key(), OPENSSL_RAW_DATA, substr( $raw, 0, 12 ), substr( $raw, 12, 16 ) );
		return false === $plain ? '' : $plain;
	}

	/** Display form of a secret: the fixed prefix and the last four characters. */
	public static function mask( $plain ) {
		if ( '' === $plain ) {
			return '';
		}
		return substr( $plain, 0, 8 ) . str_repeat( '*', 8 ) . substr( $plain, -4 );
	}
}
