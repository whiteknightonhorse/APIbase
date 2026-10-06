# Tilda: add AI payment

For a Tilda site. Nothing to install, no plugin and no script: you paste a link. First connect your shop at /integrator/connect (or with your agent: /integrator/agent-guide) and note your `<slug>`.

## Steps

1. In the page editor add a button block (or a text block) where the product is.
2. Set the button link to link A and the label to the link text.
3. For link C, put the shop link in the footer block.
4. Publish the page.

## The links

- A, button at a product: `https://apibase.pro/m/<slug>/p/<sku>`
- B, button at checkout: `https://apibase.pro/m/<slug>/cart?items=<sku>:1`
- C, "AI purchase" block on the home page: `https://apibase.pro/m/<slug>`

Use the link text "Buy with your AI agent". Ready-made markup for each: /integrator#options.

Menu names change between versions of the builder; the link itself does not. Check the result at `/integrator/check/<slug>`.
