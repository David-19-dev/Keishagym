# Third-party notices

KeishaGym is a fork of **openGym** — Copyright (C) 2026 Duarte Santos — and carries its
licence: the code is **GNU AGPL v3.0** (see [LICENSE](LICENSE)).

## App store exception

As an additional permission under section 7 of the AGPL v3.0, the copyright holder permits
distribution of the mobile application through app store platforms (such as the
Apple App Store and Google Play) whose terms of service would otherwise be incompatible
with the AGPL, provided the corresponding source code remains available under the AGPL at
the project repository. This permission applies to the distribution channel only and does
not otherwise limit the license.

## AI provider

The optional AI Coach calls the **Anthropic API** from a Supabase Edge Function, under an API
key the instance owner supplies. Nothing of Anthropic's is bundled or linked here, and
KeishaGym ships no credentials and asks its users for none. Using the feature is a matter
between the instance owner and Anthropic; instances that would rather not carry it simply do
not deploy the function.

## Body diagram geometry

The muscle outlines the body maps are drawn from (`frontend/src/lib/body-paths.js`) are derived
from [**MuscleMap**](https://github.com/melihcolpan/MuscleMap) by Melih Colpan, used under the
**MIT License** and reproduced below. MuscleMap ships its path data as Swift source rather than
`.svg` files; the paths were converted to a JSON module, its sub-group shapes were dropped, and
nothing else about the artwork was changed.

```
MIT License

Copyright (c) 2026 Melih Colpan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Exercise data & photos

The exercise names, instructions (`frontend/src/lib/exercises-data.js`, regenerated via
`scripts/build-exercises.mjs`) and the two photos per exercise (fetched into `media/ex/` at
build time) come from
[**yuhonas/free-exercise-db**](https://github.com/yuhonas/free-exercise-db), released into the
**public domain under the [Unlicense](https://unlicense.org/)**. No attribution is required and
commercial use — including a store app — is unrestricted. The photos are not committed here;
they are downloaded from the upstream source on first run.

KeishaGym previously used hasaneyldrm/exercises-dataset, whose animations are © Gym visual and
need a licence from [gymvisual.com](https://gymvisual.com/) before any redistribution. Nothing
from that dataset remains in this repository.
