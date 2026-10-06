Subject: Buyer data for an APIbase order is ready to collect

Hello {merchant_name},

An order of your shop carries encrypted buyer data. It is stored temporarily: please retrieve it now and keep your own copy.

Fetch it with GET /api/v1/shop/merchants/me/orders/<order_id>/pii (order_id is in the order.paid webhook). Passport data is deleted 7 days after the first delivery to you, at the latest 30 days after the order; addresses 30 days after the order is closed.

Decrypt with the private key that matches your published encryption key. APIbase cannot read this data and cannot restore a deleted copy.

Check page: https://apibase.pro/integrator/check/{slug}
