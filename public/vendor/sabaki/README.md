# Sabaki influence
Source: https://github.com/SabakiHQ/influence/tree/6c04d494ce1e323261696a2667d3e895c7c05cff
Version: 1.2.2, MIT license. Only CommonJS imports/exports converted to ES modules; algorithm unchanged.
The application calls discrete influence.map with upstream defaults (maxDistance=6, minRadiance=2). A separate application adapter bounds single-color opening positions, for which upstream areaMap would otherwise claim the entire board. No random playouts or automatic dead stone removal.
