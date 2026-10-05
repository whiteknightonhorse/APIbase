# Shopify: add AI payment

For a Shopify store. Nothing to install, no plugin and no script: you paste a link. First connect your shop at /integrator/connect (or with your agent: /integrator/agent-guide) and note your `<slug>`.

## Steps

1. Open the product, and in the description editor switch to the HTML (source) view.
2. Paste markup A at the end of the description and save.
3. For link C, add a text block with the shop link to the footer or home page in the theme editor.
4. Shopify's checkout does not take third-party scripts, and this needs none: B is a plain link, put it in the cart page text.

## The links

- A, button at a product: `https://apibase.pro/m/<slug>/p/<sku>`
- B, button at checkout: `https://apibase.pro/m/<slug>/cart?items=<sku>:1`
- C, "AI purchase" block on the home page: `https://apibase.pro/m/<slug>`

Use the link text "Buy with your AI agent" (or «Купить через AI-агента»). Ready-made markup for each: /integrator#options.

Menu names change between versions of the builder; the link itself does not. Check the result at `/integrator/check/<slug>`.
