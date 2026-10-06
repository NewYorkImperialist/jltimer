"use strict";

// Layer laser (v3) sticker effects: the turning layer's actual stickers turn blue while the layer animates
// (done inside the 3D cube, see twistynnn.js tintSticker), so only the moving pieces light up, not the gaps.
jlFx.register({
	id: 'v3-sticker-blue',
	name: 'Sticker Glow (blue)',
	v3: true,
	stickerTint: { color: 0x2a8cff, amount: 0.35 },
	onMove: function() {}
});
jlFx.register({
	id: 'v3-sticker-light',
	name: 'Sticker Glow (light blue)',
	v3: true,
	stickerTint: { color: 0x9fdcff, amount: 0.5 },
	onMove: function() {}
});
