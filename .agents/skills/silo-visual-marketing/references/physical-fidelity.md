# Physical fidelity

Use for product imagery, compositing, retouching and human use of Silo. [Product context](product-and-service.md) owns behavior; this reference identifies visible construction, useful anchors and evidence limits.

## Choose references for the depicted state

Inspect a matching original photo or real action sequence before prompting. Match finish, container size/form, angle, attached parts and action state. Use a whole-object view plus detail/action evidence when one source cannot resolve both. Keep style conditioning separate from product identity.

The [product reference sources](product-sources.md) and [machine-readable index](product-source-index.json) record original links, dimensions and inspection timestamps. No photos or video frames are bundled. Retrieve authorized originals and inspect matching views or source footage; the reference IDs below identify states within those originals. Confirm photographic/rendered/generated provenance rather than inferring it from a folder name. Generated or retouched artwork cannot independently establish physical construction.

## Preserve visible construction

| Component | Preserve and inspect |
|---|---|
| Base body | Broad low rounded countertop form, flat glass working surface, sloped/curved front, lower edge and visible perforated area. Match finish and perspective; no tower, docking arm, added hose, melted edge or floating base. |
| Front controls | Central round dark display/rim, three circular controls on each side, source glyph shapes/sizes and visible apertures. Match spacing, screen content and light-ring geometry/state. Perspective may make circles elliptical. No extra controls or touchscreen gesture. |
| Container | Clear rigid rounded-square body, wall-side vertical airway/channel, thicker lower rim and selected proportions. Preserve transparency/refraction, corners, seams and wall thickness; no generic cylinder, opaque wall or flexible bag. |
| Lid | Separate opaque lid, selected finish, elongated off-center rocker on its own hinge and distinct vacuum indicator. Preserve channel-to-rocker orientation, outline/contact area, gauge and thickness; no added latch, straw, top pump or hinge attaching the main lid to the body. |
| Branding | Real wordmark and control marks at source positions, with correct spelling, scale and proportions. Use supplied artwork or a precise edit when generation cannot render them faithfully. |
| Contact/contents | Supported base, flat seated container, believable grip and food inside the rigid body. No intersecting hands, merged fingers, food escaping through walls or unexplained changes in size, finish or contents. |

Compare channel, lid and rocker as a relationship: do not center, duplicate or taper the channel, flip the lid independently or lose the clear wall. Preserve real perspective and refraction. Inspect accessory detail and relative scale against its own references; a generated lineup cannot establish either.

## Describe the features to the generator

Silo names identify parts for the agent; they do not teach a separate generator their appearance. In the actual submitted instruction, pair each relevant name with its observed form, object-relative location, relationship to neighboring parts and permitted state/change. Bind that description to the supplied source image or detail crop using the tool's supported reference labels. Do not rely on the product name, a generic vacuum-container description or a bare instruction to preserve a rocker/channel.

| Feature | Information to carry into the instruction |
|---|---|
| Air channel | Identify the visible vertical airway formed along one container wall, separate from the food compartment. Describe its source location, outline, width and relationship to the lid/rocker; retain exactly the channel visible in that reference without centering, duplicating or tapering it. Product context establishes its connection from the upper air space to the bottom vacuum connection; do not invent visible openings or a cutaway to illustrate hidden routing. |
| Lid rocker | Identify the elongated off-center component on the opaque lid, with its own pivot, distinct from the main lid and vacuum indicator. Describe its source outline, ends, orientation and contact position relative to the container channel. Rocker movement releases the vacuum; it is not the vacuum-start button or a hinge attaching the main lid to the body. |
| Device buttons | Identify the physical circular controls flanking the central display: three on each side. Preserve their visible count, arrangement, sizes, spacing and exact source glyphs. Describe only those visible in the chosen view; do not add hidden buttons or replace uncertain glyphs with plausible symbols. |
| Screen | Identify the central round display separately from its surrounding light ring and the buttons. Carry the required content, layout, legibility and observed state into the prompt. Preserve an edited image's source content unless the brief requires a verified change; a generated approximation is not the reference for later repairs. |
| Light ring | Identify the luminous ring around the display, with source shape, thickness, hue and illuminated pattern/state. Distinguish emitted light from reflections and from the lid vacuum indicator. For motion, use the intended verified progression rather than freezing every state or inventing an animation. |

Inspect originals at enough resolution to resolve these details. Use a whole-product reference plus relevant detail views/crops when the generator supports them, keeping crops as detail references rather than replacement scene framing. Temporary task references do not become a bundled asset library. If a feature remains unclear, retrieve a better original or report the missing evidence instead of filling it from generic product familiarity. Preserve source perspective; object-relative positions are more reliable than image-left/right when the viewpoint changes.

## Verify the product after every pass

Use the source-anchored feature descriptions as the review checklist. Compare the output with real originals for container/channel geometry, channel-to-rocker orientation, lid/indicator, control count/glyphs, screen and light ring, plus relevant transparency, branding and contact. Check requested changes separately from protected details. Keep a concise matched/mismatched/unverified assessment with the comparison source for each relevant visible feature; a feature outside the view is not a checked hidden feature.

Inspect the whole image and product-detail views. A zoom cannot recover detail absent from the delivered pixels: obtain a suitable render or preserve the original region when critical details cannot be resolved. For video, check these relationships across movement, occlusion and transitions using [video workflow](video-workflow.md); one faithful frame does not establish a faithful clip.

Catch recurring defects before asking the user to accept a result. Correct mismatches within the authorized scope, then repeat the complete feature check, including regions that were correct before the repair. Keep real originals as the construction authority throughout retries. Do not declare fidelity passed while known structural defects remain, or when a critical visible feature lacks a usable comparison/inspection. If tools cannot expose pixels or support adequate video inspection, state what is unverified and provide the candidate for review rather than claiming it was checked.

## Match anchors to their actual coverage

| Need | Available reference and limitation |
|---|---|
| Base/container appearance | `base-white-front`, `base-black-human-contact`, `containers-white-four`, `containers-black-detail`. Visible construction, not engineering measurements. |
| Carry/place/press | `place-carry-2.0s`, `place-seat-2.6s`, `place-lid-contact-3.6s`. View the linked source sequence to establish movement. |
| Vacuum progress | `seal-hands-off-2.0s`, `seal-progress-5.5s`. `seal-lift-7.0s` shows removal while weighing is displayed; use it for physical lifting, not correct tutorial timing. |
| Rocker pressing | `rocker-contact-268.5s` and `rocker-tilted-270.0s` show contact at the circular end opposite the wordmark and pivot. The alternative rocker-lift action needs matching footage for exact hand motion. |
| Separate lid handling | `lid-handling-6.5s` and `lid-detached-7.5s` show a separate unvacuumed sequence; they do not verify a continuous sealed opening. |
| Stowing/cord | `stow-render-flat-16.75s` and `stow-render-upright-18.5s` show rendered orientation only, without real grip/cord motion. `setup-rear-cord-15.0s` is separate setup footage. |

Retrieve matching evidence for continuous sealed opening, human stowing, underside/seal detail, complete voice labeling, basic-mode interaction or current app UI. Existing anchors do not verify those complete sequences or their audio. Do not infer hidden geometry or precise motion from highlights, thumbnails or one perspective.

## Prompt and validate physical actions

State start state, human contact, direction, support and end state. Keep carrying, seating, downward closed-lid pressure, waiting, lifting and rocker release distinct. Use the documented action order from product context; a frame showing contact cannot establish when a system prompt occurs.

Use the complete feature check above and inspect hand contact, support and the documented action order separately from visual appeal. For video, use the temporal/audio checks in [video workflow](video-workflow.md).

Constrain isolated repairs to the affected area while preserving correct parts. If construction or several relationships are wrong, return to stronger originals and simplify the generation. Reinspect previously correct regions after every edit. Report unseen action details or unresolved defects rather than treating a generated result as its own physical reference.
