Subject: Buyer data for an APIbase order cannot be decrypted with your current key

Hello {merchant_name},

You rotated your encryption key while an order still held buyer data encrypted to the previous key. APIbase does not re-encrypt stored data, so that envelope can only be opened with your OLD private key.

Fetch it with GET /api/v1/shop/merchants/me/orders/<order_id>/pii and decrypt it with the old key before it is deleted. The storage is temporary: keep your own copy.

Check page: https://apibase.pro/integrator/check/{slug}
