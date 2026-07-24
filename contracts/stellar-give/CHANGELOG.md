# Changelog

## [0.2.0](https://github.com/Feyisara2108/stellargive/compare/stellar-give-v0.1.0...stellar-give-v0.2.0) (2026-07-24)


### Features

* add cancel_campaign function with creator auth and raised_amount guard ([fe6e268](https://github.com/Feyisara2108/stellargive/commit/fe6e26825d5a717728dda14db57bdc539af0cfd7))
* add cancel_campaign with creator auth, Cancelled status, and do… ([55020dc](https://github.com/Feyisara2108/stellargive/commit/55020dcc83abceb905fcfcac0ca109dab9486bf6))
* add cancel_campaign with creator auth, Cancelled status, and donor refunds ([956c73f](https://github.com/Feyisara2108/stellargive/commit/956c73fa039ba75ad1f41f2c119b582eaa557c3f))
* add category field to campaigns using Symbol for storage efficiency ([6742166](https://github.com/Feyisara2108/stellargive/commit/67421662265660215825072570c08897d5ade4a1))
* add description field to Campaign struct with 500-char limit ([a3ff382](https://github.com/Feyisara2108/stellargive/commit/a3ff382292a9bce52048362d5a3d7b94e575d074))
* add description field to Campaign struct with 500-char limit ([b4d6e23](https://github.com/Feyisara2108/stellargive/commit/b4d6e23f3e037d722c4209ad5e847ad8db2b5054))
* add get_time_left helper returning seconds until campaign deadline ([29ae8a1](https://github.com/Feyisara2108/stellargive/commit/29ae8a1d75070ea02ab8bee2fca3ae33435d6a4a))
* add get_total_campaigns readonly helper for platform statistics ([c5c222b](https://github.com/Feyisara2108/stellargive/commit/c5c222b0fb1438738906bc91a04ce68576af2e2a))
* add is_anonymous flag to donate function for privacy-preserving contributions ([203a9e1](https://github.com/Feyisara2108/stellargive/commit/203a9e18fa27f6635cda4a5569761d6e9be71724))
* add is_anonymous flag to donate function for privacy-preserving… ([99f14bf](https://github.com/Feyisara2108/stellargive/commit/99f14bf42e41f20aaf4b3f9353a4661c243a065e))
* add optional donor comment parameter emitted via DonationEvent ([061d43c](https://github.com/Feyisara2108/stellargive/commit/061d43c43c04932e9b9931da7c8247f0610fb400))
* add optional donor comment parameter emitted via DonationEvent ([b9d4d0c](https://github.com/Feyisara2108/stellargive/commit/b9d4d0cc52184ef010361068b2b2fdf3949b7d2a))
* add optional website and twitter fields to campaigns with https validation ([85a185b](https://github.com/Feyisara2108/stellargive/commit/85a185b73b8116419b30ac6841901ae0e41eed83))
* add private campaign mode with creator-managed donor whitelist ([14d5b44](https://github.com/Feyisara2108/stellargive/commit/14d5b44e339c0138cf17d0fec60c3910ba56838d))
* add UX improvements - consent banner, breadcrumbs, command palette, and image optimization ([8c05731](https://github.com/Feyisara2108/stellargive/commit/8c05731a78c76ef9a487aaafb6e461d3035f1b14))
* allow one-time deadline extension for active campaigns by creator ([c417df1](https://github.com/Feyisara2108/stellargive/commit/c417df19e690c0c7033bff8fda39f65accb71caa))
* built and deployed the contract to stellar testnet ([419b08a](https://github.com/Feyisara2108/stellargive/commit/419b08accdf5e153a870b48b5c9cdd91878b6678))
* consolidate description, pause, and refund features with resolved conflicts ([af987a8](https://github.com/Feyisara2108/stellargive/commit/af987a8d51d4b6527d2eda6d2f7dbfd4f550a5d1))
* enable creators to post on-chain campaign updates ([bf90359](https://github.com/Feyisara2108/stellargive/commit/bf903599750d9d6a76acc5dc2ffe1bf9e4935422))
* enable creators to post on-chain campaign updates ([ebcd99d](https://github.com/Feyisara2108/stellargive/commit/ebcd99dc30c65f4d994b76545b446fac6915130a))
* Implement 'Fee on Claim' mechanism ([f8ec2a5](https://github.com/Feyisara2108/stellargive/commit/f8ec2a5dc73e840a7e1307b7f1701d21ed55670c))
* Implement 'Goal Reached' event ([a5cc3e3](https://github.com/Feyisara2108/stellargive/commit/a5cc3e3d40e3acf4787ed85dc31df3f902bae8d1))
* implement admin-controlled emergency pause for critical functions ([3628d19](https://github.com/Feyisara2108/stellargive/commit/3628d194ef3ae67bfc9d3b75b568bef2a6bb2078))
* implement auto-claim trigger when donation pushes campaign to target ([5a15801](https://github.com/Feyisara2108/stellargive/commit/5a15801f9a595b62ef32e3754e69416cbddcb6bc))
* implement contract upgrade, campaign search, paginated and batc… ([5f991dc](https://github.com/Feyisara2108/stellargive/commit/5f991dc95eb57f3a51333d79c84de37e343872ae))
* implement contract upgrade, campaign search, paginated and batch fetch ([18431e6](https://github.com/Feyisara2108/stellargive/commit/18431e612e38994d184e8a5b19c8ac4c4c628c34))
* implement contribution caps, minimum target, and metadata URI ([f62c9ac](https://github.com/Feyisara2108/stellargive/commit/f62c9ac2203d45ec79ec59598b5071b5eba92319))
* implement contribution caps, minimum target, and metadata URI ([ef2726f](https://github.com/Feyisara2108/stellargive/commit/ef2726f60ddc79f5ac2184c93440a81429b09fd8))
* Implement GoalReached event and validate campaign beneficiaries ([bf9b23b](https://github.com/Feyisara2108/stellargive/commit/bf9b23b7233fbb5eb8a7b78c9207c9ee9b6a6928))
* implement refund function for expired underfunded campaigns ([fe6ce9f](https://github.com/Feyisara2108/stellargive/commit/fe6ce9f3f3aacd7c13e61899aeede1a3c4f67598))
* implement refund function for expired underfunded campaigns ([2c8708d](https://github.com/Feyisara2108/stellargive/commit/2c8708d6b8e6fd0ff3b26079f78f445ae3f3b9e3))
* litepaper, audit,storage ([5dcf90f](https://github.com/Feyisara2108/stellargive/commit/5dcf90f5afd995e7de71e174b1913e6561243ee5))
* litepaper, audit,storage ([e8557d7](https://github.com/Feyisara2108/stellargive/commit/e8557d700ab5d81dbca3996f431a09e9f392f482))
* maintain top 5 donors per campaign with on-chain indexing ([a54edad](https://github.com/Feyisara2108/stellargive/commit/a54edad296da59a7a3ae5d7a5f43c5faccd8e1e2))
* resolve hydration mismatches, add campaign sorting, and enforce CI linting ([00a2da5](https://github.com/Feyisara2108/stellargive/commit/00a2da563e438d5148e1f6e88cd5079b5cd5d2e0))
* scaffolded project structure ([f8de72a](https://github.com/Feyisara2108/stellargive/commit/f8de72a4278104e30cf1dc84b0faf297c0138819))
* token validation, campaign form rules, progress bar colors, and explore page ([1ee9e2a](https://github.com/Feyisara2108/stellargive/commit/1ee9e2a13aceff171b1437b67cf592dfbd1ddd75))
* token validation, form rules, progress bar colors, explore page ([f006749](https://github.com/Feyisara2108/stellargive/commit/f006749d1135bc5c9f526d85f3335de6ddca24e5))
* Validate beneficiary address ([43f6c8f](https://github.com/Feyisara2108/stellargive/commit/43f6c8fc7d282854b4bd84f41298b94c2e70e59d))
* wrote documentation with project details details ([3c4614c](https://github.com/Feyisara2108/stellargive/commit/3c4614c0aeba44040f20527f2edc4dadbf9db391))


### Bug Fixes

* **ci:** make Dependency Audit pass on real, fixable issues ([c1fc276](https://github.com/Feyisara2108/stellargive/commit/c1fc2762df68e87a73a84e230fdaca9280b7a24d))
* **contract:** repair test suite and guard refund when paused ([e62c202](https://github.com/Feyisara2108/stellargive/commit/e62c20239e6d1e6ca7c6cbf3930d64dc510d7365))
* contributed to issues [#120](https://github.com/Feyisara2108/stellargive/issues/120) [#121](https://github.com/Feyisara2108/stellargive/issues/121) [#122](https://github.com/Feyisara2108/stellargive/issues/122) [#123](https://github.com/Feyisara2108/stellargive/issues/123) ([ac102b3](https://github.com/Feyisara2108/stellargive/commit/ac102b37b2ec9f608f015f6f9587291dd73eb0ef))
* contributed to issues [#120](https://github.com/Feyisara2108/stellargive/issues/120) [#121](https://github.com/Feyisara2108/stellargive/issues/121) [#122](https://github.com/Feyisara2108/stellargive/issues/122) [#123](https://github.com/Feyisara2108/stellargive/issues/123) ([76c3b7e](https://github.com/Feyisara2108/stellargive/commit/76c3b7e6131c25f47d3a1f708269ffd3ce80618c))
* **deps:** patch known security advisories (safe, non-breaking) ([b2655c8](https://github.com/Feyisara2108/stellargive/commit/b2655c82749b8572021f08db45517c1b9403bf6a))
* reject campaign creation with deadlines in the past ([d9ac4d0](https://github.com/Feyisara2108/stellargive/commit/d9ac4d00497b05eb84c2332725bd1748ec4dfc6b))
* reject campaign creation with deadlines in the past ([8b40123](https://github.com/Feyisara2108/stellargive/commit/8b4012340bffda22a807d73927acf30ee460deae))
* resolved all issues in one: [#50](https://github.com/Feyisara2108/stellargive/issues/50), [#52](https://github.com/Feyisara2108/stellargive/issues/52), [#53](https://github.com/Feyisara2108/stellargive/issues/53), [#62](https://github.com/Feyisara2108/stellargive/issues/62) ([2bc6192](https://github.com/Feyisara2108/stellargive/commit/2bc6192ff2ef46b53beed4e72f19c4dc4639930c))
* resolved all issues in one: [#50](https://github.com/Feyisara2108/stellargive/issues/50), [#52](https://github.com/Feyisara2108/stellargive/issues/52), [#53](https://github.com/Feyisara2108/stellargive/issues/53), [#62](https://github.com/Feyisara2108/stellargive/issues/62) ([3889d14](https://github.com/Feyisara2108/stellargive/commit/3889d141108514dc930b2247f3fc9f5c70d5b9f6))
* resolved all issues in one: [#50](https://github.com/Feyisara2108/stellargive/issues/50), [#52](https://github.com/Feyisara2108/stellargive/issues/52), [#53](https://github.com/Feyisara2108/stellargive/issues/53), [#62](https://github.com/Feyisara2108/stellargive/issues/62) ([35a7bb8](https://github.com/Feyisara2108/stellargive/commit/35a7bb8cabcbc8e41dee94649aace07718982a6d))


### Performance Improvements

* benchmark and optimize campaign ID generation storage pattern ([83670bd](https://github.com/Feyisara2108/stellargive/commit/83670bd71f2cf43ca88a13177cb71c9de82069c1))
* migrate next_id counter to Instance storage for fee reduction ([c5fe607](https://github.com/Feyisara2108/stellargive/commit/c5fe60702dafab621eca003c9f14264f3eb3b75c))
* migrate next_id counter to Instance storage for fee reduction ([b864612](https://github.com/Feyisara2108/stellargive/commit/b864612cbb17846aaf476836d96d1f2dc9f79a3c))
* migrate reentrancy lock to Temporary storage to reduce persistent state bloat ([f635023](https://github.com/Feyisara2108/stellargive/commit/f635023585d4ba4f8e75bed18b59f752e791d8ac))
