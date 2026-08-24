# FOUNDATION-03 synthetic animation-pack fixture

Copyright (c) 2026 Gym Local contributors. Distributed under the repository
MIT License: <https://github.com/luutru433-coder/gym-local/blob/main/LICENSE>.

This fixture is project-authored structural test data. It contains no scraped,
third-party, or real exercise media. The sole payload is reviewable Base64 text
that decodes to exactly 48 bytes: a GLB 2.0 header and one 28-byte padded JSON
chunk for `{"asset":{"version":"2.0"}}`. It intentionally contains no playable
exercise animation and makes no claim that an animation clip exists.

The reviewed source record is this README at
<https://github.com/luutru433-coder/gym-local/blob/main/tests/fixtures/animation-pack-v1/README.md>.
Authorship, attribution, explicit `None` modifications, MIT terms, approved
review metadata, and offline redistribution scope are repeated in
`valid/pack-source.json`. Tests decode the Base64 only into fresh temporary live
source trees; the committed fixture directory itself is never builder input.
