# WooCommerce: add AI payment

For a WooCommerce store. Nothing to install, no plugin and no script: you paste a link. First connect your shop at /integrator/connect (or with your agent: /integrator/agent-guide) and note your `<slug>`.

## Steps

1. Open the product and, in the description or short description, use the Text (HTML) tab.
2. Paste markup A and update the product.
3. For link C, add a Custom HTML or paragraph block to the home page.
4. A WooCommerce plugin is not part of this release.

## The links

- A, button at a product: `https://apibase.pro/m/<slug>/p/<sku>`
- B, button at checkout: `https://apibase.pro/m/<slug>/cart?items=<sku>:1`
- C, "AI purchase" block on the home page: `https://apibase.pro/m/<slug>`

Use the link text "Buy with your AI agent" (or «Купить через AI-агента»). Ready-made markup for each: /integrator#options.

Menu names change between versions of the builder; the link itself does not. Check the result at `/integrator/check/<slug>`.
