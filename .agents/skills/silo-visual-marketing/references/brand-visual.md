# Silo visual brand

Use the relevant brand-book rules and inspect the current website implementation for the deliverable. Canonical source: [Silo Style Guide](https://www.figma.com/design/WEUK0YZILjPHF3Ai2CWmi3/Silo-Style-Guide?m=auto&t=F4pKAFMOnmunSMzF-6), BrandBook page `0:1`. The [source-node index](brand-sources.md) locates the relevant boards. Retrieve and inspect those nodes; screenshots are not bundled with this skill, and source boards are not ready-to-publish artwork or product specifications.

## Load according to the deliverable

| Work | Relevant guidance |
|---|---|
| Product photo, image edit, generated footage | Imagery direction and physical-product references. Load logo, type and layout rules only when the output includes those elements. |
| Campaign composition, social graphic, company asset | Imagery plus the relevant logo, color, typography and composition rules. Use the supplied campaign/template when present. |
| Website page or section | General brand rules plus direct inspection of the relevant current website page, responsive composition and existing implementation. |
| Technical or explanatory graphic | Illustration style plus independently verified product geometry, behavior and dimensions. |
| Print | Logo size and supplied print specifications; the book's print palette is incomplete. Obtain missing production color specifications before final print preparation. |

The brand book supplies general visual rules; the website supplies richer implemented compositions. Choose the relevant detail for the task. Neither branding samples nor promotional counters establish product facts or approved claims.

## Imagery direction

| Subject | Source-backed direction | Visual anchor |
|---|---|---|
| Atmosphere | Warm, elegant, inviting, well-lit kitchens; muted decor and restrained environmental contrast. Match an existing device color to the setting through asset choice, lighting and surroundings, while preserving the product's actual finish. Direct sunlight can add focus in a detail shot. | [Atmosphere](brand-sources.md), node `6:782` |
| People | Food care and effortless everyday use. Gestures should look natural and purposeful within an ordinary kitchen routine. Validate the actual depicted action against physical references. | [People](brand-sources.md), `6:814` |
| Product | Intimate views, varied angles and crops that explain both the whole product and its details. Soft light against a darker background is an available close-up treatment; deliberate camera movement can draw attention in motion. | [Product shots](brand-sources.md), `6:827` |
| Fresh/cooked food | Appetizing, lovingly prepared food with a believable home setting; light backgrounds, soft natural illumination and shadow, warm everyday feeling. Coordinate the image colors with adjacent graphics. | [Food](brand-sources.md), `6:972` |
| Food texture | Simple close crops of food appropriate for container storage; limited tonal variation for texture-led visual breaks. White overlay text is conditional on actual readability; images may stand alone. | [Close-up food](brand-sources.md), `6:996` |
| Lifestyle | Personal home environments, warm bright natural light, candid expressions and wider context. Center the customer when the brief is about their life; show positive, confident moments, varied families and believable use. Wood and restrained brand-color accents can warm the setting. | [Lifestyle](brand-sources.md), `6:1017` |

These are distinct treatments: a product-detail close-up may use a darker background even though everyday food photography uses a light one. Select the treatment deliberately. The product-shot board contains inspiration objects as well as Silo; use verified physical-product assets to define Silo geometry, controls, lids and interaction.

Describe container arrangements explicitly: containers nested inside another container, or closed containers placed one on top of another. Do not use ambiguous stacking instructions or imply a locking/secure-stack mechanism from a photo. Preserve the arrangement in the selected physical reference.

## Logo and color

Use supplied logo artwork. Preserve letterforms, spacing and proportions; do not redraw, outline, decorate or ask a generator to invent the logo. Reserve clear space using the height/width of the logo's `o` as shown in [clear-space guidance](brand-sources.md), node `4:327`. Minimum width is 100 px for digital and 0.75 in for print (`4:277`).

Dark green is the normal logo on light backgrounds; black is allowed when color is unavailable. White is the reverse artwork. The variation page (`5:427`) specifically depicts white on green, black and yellow; the misuse page (`5:1312`) broadly warns against accent backgrounds. For a new composition use an unambiguous dark-green/light-background or white/green-or-black pairing; if the brief needs yellow or another less clear treatment, inspect the exact source/template and resolve it with the reviewer. Busy imagery must not compromise recognition.

Digital palette labels below come from node `6:1091`; use [the palette source node](brand-sources.md) for visual comparison.

| Group | Labeled colors |
|---|---|
| Green | Main `#00623D`; mid `#539E67`; secondary `#C5E5AB`; background `#ECF6DF` |
| Beige | Background `#F8F4EC`; secondary `#F7EEDE`; mid `#EBDDC7`; dark `#CDBCA0`; very dark `#A28658` |
| Yellow | Dark `#EBCD5D`; highlight `#F6E398`; light `#FAF2D2` |
| Red | Dark `#E15349`; deep `#F26E65`; red `#F7C5BA`; light `#FBEBE6` |
| Neutral | Text `#000000`; gray text `#676767`; white `#FFFFFF` |

Dark green leads; light beige, light green and white provide backgrounds; beige, yellow and red provide limited accents and illustration color. Check contrast in the actual composition. For print, consult [the print source](brand-sources.md), `5:1432`; do not present the digital palette as a complete print specification.

## Type, composition and illustration

The written hierarchy at `5:2012` specifies the following roles. The book describes Aspekta as the primary family and Oktah as the secondary family; their use depends on role.

| Role | Written brand-book direction |
|---|---|
| Eyebrow | Aspekta 200, sentence case, black |
| Headline | Oktah semibold, sentence case, dark green or black; 1.2× leading |
| Small headline | Aspekta 700, sentence case, black; 1.2× leading |
| Body | Aspekta 200, sentence case, black; 1.3× leading |
| Highlight | Oktah semibold, uppercase, dark green; 0.9× leading |

Some source layers have mixed/demo font names and do not precisely match the written hierarchy. Obtain the team's correct licensed font assets for production; do not silently replace an unavailable font. The inspected website uses `OktahNeueSemiBold` and `Aspekta`, including body weights above 200. Website work should inspect the target's actual type and responsive layout rather than apply a universal book-size or weight override.

Cards use a small standard radius and a larger radius on one or two corners, inspired by the container shape (`6:413`, `13:865`). The source describes the large radius as roughly 5–8× the standard radius. Align tighter corners between stacked cards and use larger corners on outward edges. This is a proportional composition rule; determine actual dimensions from the intended format or existing target design, not from a sample card's pixel labels.

Illustrations explain clearly with simple geometric/organic forms, flat Silo colors and thin precise strokes; typically one or two shades define each element (`5:2049`). Technical graphics use thin consistent linework, a flat monochromatic background and only the details needed for accurate explanation (`6:221`). Infographics use relevant elements, sparse detail and simple shapes (`6:1082`). Verify every quantity, label and mechanism separately from styling.

## Website implementation and review

The [homepage](https://www.heysilo.com/) implements warm kitchen footage beneath a large white headline, a green primary action, line feature icons, light-green sections and spacious hierarchy. The [system page](https://www.heysilo.com/products/silo-vacuum-storage-system) combines a clear product/gallery area with a light-beige information panel and green selection outlines. The [overview](https://www.heysilo.com/pages/overview) uses a product-led visual hero with an asymmetric rounded enclosure. These observations are orientation, not a fixed page template; inspect the current target for website work.

Before delivery, compare the result with the selected visual anchors and verify intended lighting, atmosphere, food texture, crop, human gesture, logo integrity and any included typography/color/layout. Physical accuracy is required throughout, including attractive compositions. Check text readability at the delivered size; obtain reviewer resolution for unresolved source ambiguity and disclose missing production assets.
