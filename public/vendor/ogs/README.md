# OGS score estimator
Source: https://github.com/online-go/score-estimator/tree/87c8f916e4a492c67cad5aa3ea82e335900ab436
License: MIT (see LICENSE). Source unmodified. Built with Emscripten 6.0.9.

```sh
emcc jsbindings.cc -std=c++14 -O2 -DEMSCRIPTEN=1 -DUSE_THREADS=0 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node '-sEXPORTED_FUNCTIONS=["_estimate","_malloc","_free"]' '-sEXPORTED_RUNTIME_METHODS=["HEAP32"]' -sSTACK_SIZE=5242880 -sALLOW_MEMORY_GROWTH=1 -o estimator.js
```
The legacy EMSCRIPTEN define disables native debug printing with modern Emscripten. Worker adapter maps white 2 to -1 and uses 1000 trials, tolerance 0.1. No model or third-party network service is used at runtime.
