# Asset provenance

Production images live in `web/public/art/`. All art was generated for CueBound with OpenAI image generation, art-directed to match the reference game's Kenney pixel-art style; the game and UI screenshots used as visual references were our own, not source sprites. No trademark logo was requested or used. The five `design-refs/` images were layout references for the landing page and are not part of the repository.

| File | Generator / processing | Exact prompt ID | Final pixels |
|---|---|---|---|
| `bg-sky.png` | OpenAI imagegen + Pillow sizing | P1 | 2560×1080 |
| `bg-hills.png` | OpenAI imagegen + Pillow sizing | P2 | 2560×1080 |
| `bg-front.png` | OpenAI imagegen + Pillow sizing | P3 | 2560×1080 |
| `icon-record.png` | OpenAI imagegen + Pillow sizing/cell crop | P4 | 256×256 |
| `icon-events.png` | OpenAI imagegen + Pillow sizing/cell crop | P4 | 256×256 |
| `icon-style.png` | OpenAI imagegen + Pillow sizing/cell crop | P4 | 256×256 |
| `icon-listen.png` | OpenAI imagegen + Pillow sizing/cell crop | P4 | 256×256 |
| `icon-export.png` | OpenAI imagegen + Pillow sizing/cell crop | P4 | 256×256 |
| `icon-livepeer.png` | OpenAI imagegen + Pillow sizing/cell crop | P4 | 256×256 |
| `icon-brief.png` | OpenAI imagegen + Pillow sizing/cell crop | P4 | 256×256 |
| `icon-coin.png` | OpenAI imagegen + Pillow sizing/cell crop | P4 | 256×256 |
| `icon-sound.png` | OpenAI imagegen + Pillow sizing/cell crop | P4 | 256×256 |
| `og.png` | OpenAI imagegen + Pillow sizing | P5 | 1200×630 |
| `design-refs/01-hero.png` | OpenAI imagegen | R1 | 1672×941 |
| `design-refs/02-how-it-works.png` | OpenAI imagegen | R2 | 1672×941 |
| `design-refs/03-livepeer-live.png` | OpenAI imagegen | R3 | 1672×941 |
| `design-refs/04-sound-brief-dkg.png` | OpenAI imagegen | R4 | 1672×941 |
| `design-refs/05-cta-footer.png` | OpenAI imagegen | R5 | 1672×941 |

Technical processing: imagegen returned 1930×815 parallax layers, a 1254×1254 nine-cell icon sheet, and a 1731×909 OG image. Pillow resized layers to 2560×1080 with nearest-neighbor sampling; alpha on hills and foreground was thresholded at 160 to keep pixel edges solid. The sheet was cut into nine equal 418×418 cells in row order and each resized to 256×256 with nearest-neighbor sampling. The OG image was resized to 1200×630 with Lanczos. The five references are unmodified imagegen PNGs.

## Exact generation prompts

### P1

```text
Create a wide 2560x1080 pixel-art PARALLAX SKY layer for a bright indie 2D platformer website. OPAQUE full canvas. Pale cyan sky (#e5f8fc) with a slight calm vertical tonal shift, a low horizontal band of chunky stepped white clouds near the bottom half, very faint distant powder-blue cloud silhouettes. Match the broad palette and crisp square-pixel scale of the attached gameplay screenshot but create wholly original shapes, do not reproduce any sprites. Leave the centre-left and upper half quiet and uncluttered for black headline text. Edge-to-edge seamless-feeling landscape, no foreground, no soil, no hills, no characters, no UI, no text, no logos, no purple gradient.
```

### P2

```text
Create a wide 2560x1080 transparent PNG PARALLAX MID HILLS layer for a bright indie 2D platformer website. Only show distant rolling powder-blue and desaturated teal pixel-art hills, a few blocky original pine and round-tree silhouettes, and a low stepped ridge across the bottom half. Crisp square-pixel edges. TOP TWO THIRDS MUST BE FULLY TRANSPARENT with real alpha, no sky fill, no checkerboard drawn into pixels. Keep centre-left calm with no high silhouettes; concentrate taller hills at far right and edges. Match the broad palette and pixel scale of attached gameplay screenshot but create wholly original shapes. No clouds, foreground grass, soil, coins, characters, UI, text, logos, or gradient blobs.
```

### P3

```text
Create a wide 2560x1080 transparent PNG PARALLAX FOREGROUND layer for a bright indie 2D platformer website. Content ONLY IN LOWER THIRD: an edge-to-edge original strip of grass green tops and terracotta orange pixel soil with sparse darker orange pebble pixels, stepped platform rises near far right, 3 small gold pixel coins over the terrain near right side, and a tiny cluster of charcoal-gray spikes at far right. Dark charcoal 3-pixel-equivalent outline, large crisp square pixels, no antialiasing. The UPPER TWO THIRDS MUST BE FULLY TRANSPARENT REAL ALPHA, no painted sky, no checkerboard. Leave centre-left above ground empty for headline overlay. Match broad palette and pixel scale of attached screenshot but DO NOT copy Kenney sprites or exact platform arrangements. No characters, UI, text, logo, cloud, hills, or gradient.
```

### P4

```text
Generate a perfectly square 3-column by 3-row PIXEL ART ICON SPRITE SHEET on a REAL TRANSPARENT RGBA background. Exactly nine cells, one isolated object centered in each cell with generous clear transparent margins; no grid lines, no labels, no shadows outside icons, no shared scene, no text. All nine in one unified game UI style: chunky crisp square pixels, consistent dark charcoal 8-pixel-equivalent outline, gentle warm highlights, limited palette of grass green, terracotta orange, coin gold, pale sky blue, warm cream and dark charcoal. Readable when each cell is reduced to 40px. Cell positions STRICTLY: top-left small terracotta video camera with clapper top (record); top-middle gold horizontal timeline with three event marker flags (events); top-right cream-and-green artist palette with one tuning knob (style); middle-left dark charcoal headphones with gold ear pads (listen); middle-middle terracotta cardboard export package with small Godot-blue accent tile, NO logo (export); middle-right green connected signal nodes with radiating arcs, NO Livepeer logo (livepeer); bottom-left warm cream rolled quest scroll with green ribbon and small gold seal (brief); bottom-middle single bright gold coin with square hole or glint (coin); bottom-right dark charcoal speaker with two gold sound waves (sound). Create original icon designs, no trademarks or copied sprites. Background must be transparent alpha, not painted checkerboard or solid color. Do not merge icons. Do not add extra objects.
```

### P5

```text
Create ONE horizontal 1200x630 OG social share image for CueBound, based on the attached website hero reference but newly composed at a wide social-card ratio. Bright original pixel-platformer world: pale cyan sky and white stepped cloud band, powder blue far hills, grassy green terracotta soil strip at bottom, three gold coins near right, tiny original green explorer figure at far right. Leave left-center calm. Large, exact, correctly spelled text 'CueBound' in bold near-charcoal rounded display typography at left. Beneath it, smaller exact text 'Give your silent game a sound kit.' Tiny gold pixel sound wave mark beside name. Crop-safe generous margins, high contrast, polished indie game-site look, no button, no logos or trademarks, no copied sprites, no fake metrics, no other text, no purple gradients.
```

### R1

```text
Generate ONE horizontal 16:9 WEBSITE HERO SECTION DESIGN REFERENCE image, not a full page, for CueBound. Art direction: polished indie pixel-platformer game site, original art inspired by the attached demo's light cyan sky, low white cloud band, distant powder-blue silhouettes, saturated grass green, terracotta orange soil, tiny gold coins and dark charcoal outlines. Do not copy any existing sprite. Warm cream product UI details and bold rounded dark display typography. This is a developer tool for indie game makers, not a game being sold. Compose as image-as-canvas: pixel landscape across entire frame; calm clean sky at centre-left for oversized legible black text; a small original green helmeted explorer character jumping near the right foreground; layered ground at bottom; restrained top navigation with CueBound wordmark only. Exact layout text, spell correctly: headline 'Give your silent game a sound kit.' Supporting sentence 'Mark the moments. Livepeer generates the sounds. Export a pack for Godot.' Single prominent button 'Start with your gameplay clip'. Small label 'FROM GAMEPLAY TO SOUND'. One clear action. Hero should be premium, playful, readable, codeable in React/Tailwind, with intentional whitespace and no dashboard panels. No fake metrics, testimonials, logos, purple gradients, translucent blobs, extra buttons, gibberish text, trademark logos, or copied game sprites.
```

### R2

```text
Generate ONE horizontal 16:9 WEBSITE SECTION design reference for CueBound titled 'From clip to sound kit'. Same palette and original pixel platformer landscape as reference: light cyan sky, white cloud band, powder blue hills, grass green, terracotta soil, gold. Warm cream UI panels and heavy rounded charcoal display typography. Exact text, all legible: 'From clip to sound kit' and three numbered steps: '1 Record your gameplay' with a tiny clip frame; '2 Livepeer generates the sound kit' with pixel speaker and sound waves, make this central and visually strongest; '3 Drop the pack into Godot' with a game asset box (no logo). One sweeping horizontal terrain path connects the three steps, with small original pixel-game objects, and clear card boundaries a React/Tailwind developer can implement. No CTA button in this explanatory section. Premium game-site composition, airy, playful but clearly a developer product. One section only, no full page, no gibberish, no fake metrics, no logos or copied sprites, no purple gradient, no stock dashboard.
```

### R3

```text
Create ONE horizontal 16:9 website section design reference, standalone section, for CueBound. It belongs immediately after the attached 'From clip to sound kit' section and uses IDENTICAL visual palette: pale cyan sky, white cloud band, powder blue far silhouettes, grassy green, terracotta soil, gold signal highlights, warm cream panels, rounded near-charcoal display type. Title exact: 'Hear the kit come alive'. Eyebrow exact: 'LIVEPEER AGENT · MIRELO-SFX'. Supporting copy exact: 'Livepeer generates a sound for every marked moment. Tap a pad, pick a take, and hear it against your clip.' Visual focal point: wide product demo panel with 5 large varied pastel game-controller sound pads labeled exactly 'Jump', 'Land', 'Coin pickup', 'Hurt', 'UI click'; one gold glowing active pad with waveform and tiny pixel sparks, other pads inactive. On left, compact gameplay clip viewport with a moving playhead and event markers; on right, the pads. Make the Livepeer line prominent, not a decorative badge. Off-grid product panel over a cropped pixel-platformer landscape, clear component boundaries for React/Tailwind/SmoothUI. No CTA button here, no fake render results or metrics, no extra text, no logos, no copied sprites, no purple gradients, no generic analytics dashboard, no gibberish.
```

### R4

```text
Generate ONE horizontal 16:9 website section design reference, standalone section, for CueBound. Same exact visual world and palette as reference: bright pixel-platformer pale cyan sky, white clouds, powder blue distant hills, grass green, terracotta soil, gold accents, cream interface cards, dark charcoal rounded display type. Section purpose: show that a saved sound brief on OriginTrail DKG lets a teammate or fresh session create the next mechanic's sound in the same style. Large exact headline 'The sound brief travels with your team.' Supporting text exact: 'Save the approved style to OriginTrail DKG. Pick it up later, add a new mechanic, and keep the kit sounding like one game.' Visual composition must differ from a three-card feature grid: large central pixel-art quest scroll/sound brief card with a short legible list 'Mood: soft & rounded', 'Keep: Jump · Land · Coin', 'Next: Dash'; dotted gold path connects it across a scenic game landscape to a second small workstation/teammate silhouette on the far right. Asymmetric editorial composition, headline at top left, visual canvas below and to right. No CTA button, no fake verification claims, no logos, no copied sprites, no gradient blobs, no gibberish. Implementation-ready React/Tailwind/SmoothUI reference.
```

### R5

```text
Create ONE horizontal 16:9 final CTA plus footer WEBSITE SECTION design reference for CueBound, same bright original pixel-platformer visual world and exact palette as attached hero: pale cyan sky, white cloud band, powder blue distant hills, grass green, terracotta soil, gold accent, warm cream, dark charcoal heavy rounded type. Distinct end-of-level composition: a broad dark-charcoal nightfall panel occupies the upper two-thirds, with only small gold pixel stars and silhouetted grass edge, while a bright grass/soil ground strip and tiny original checkpoint flag occupy bottom. Centered giant legible exact headline 'Ready to hear your game?' Smaller exact supporting copy 'Turn a gameplay clip into a sound kit that feels like it belongs.' ONE unmistakable gold primary button exact text 'Start with your gameplay clip'. Footer as quiet separate horizontal band at bottom, CueBound wordmark at left and plain text labels 'How it works', 'Livepeer', 'Sound brief' at right. No second CTA, no fake stats, testimonials, social logos, copied game sprites, purple gradients, crowded design, extra nonsense text. Developer implementation reference for React/Tailwind/SmoothUI, one section only.
```
