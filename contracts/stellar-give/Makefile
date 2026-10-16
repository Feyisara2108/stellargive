CONTRACT_NAME=stellar_give
WASM_PATH=target/wasm32-unknown-unknown/release/$(CONTRACT_NAME).wasm
NETWORK=testnet
RPC_URL=https://soroban-testnet.stellar.org
NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
SOURCE?=alice
TOKEN?=
CREATOR?=
BENEFICIARY?=
DONOR?=
CAMPAIGN_ID?=1
AMOUNT?=1000000
TARGET?=5000000
DEADLINE?=2000000000
TITLE?="Stellar Relief Campaign"

.PHONY: test build wasm fixture optimize deploy invoke-create invoke-donate invoke-claim friendbot

test:
	cargo test

build:
	cargo build

wasm:
	cargo build --target wasm32-unknown-unknown --release

# Rebuilds the WASM used as the upgrade target in tests/test_upgrade.rs from
# ../upgrade-fixture and copies it into tests/fixtures/.
fixture:
	cd ../upgrade-fixture && cargo build --locked --release --target wasm32v1-none
	cp ../upgrade-fixture/target/wasm32v1-none/release/upgrade_fixture.wasm tests/fixtures/upgrade_fixture.wasm

optimize: wasm
	stellar contract optimize --wasm $(WASM_PATH)

friendbot:
	curl -s "https://friendbot.stellar.org/?addr=$(ADDRESS)" | cat

deploy: optimize
	stellar contract deploy \
		--network $(NETWORK) \
		--source-account $(SOURCE) \
		--wasm $(WASM_PATH)

invoke-create:
	stellar contract invoke \
		--network $(NETWORK) \
		--source-account $(SOURCE) \
		--id $(CONTRACT_ID) \
		-- create_campaign \
		--creator $(CREATOR) \
		--beneficiary $(BENEFICIARY) \
		--title $(TITLE) \
		--target_amount $(TARGET) \
		--deadline $(DEADLINE) \
		--accepted_token $(TOKEN)

invoke-donate:
	stellar contract invoke \
		--network $(NETWORK) \
		--source-account $(SOURCE) \
		--id $(CONTRACT_ID) \
		-- donate \
		--donor $(DONOR) \
		--campaign_id $(CAMPAIGN_ID) \
		--amount $(AMOUNT)

invoke-claim:
	stellar contract invoke \
		--network $(NETWORK) \
		--source-account $(SOURCE) \
		--id $(CONTRACT_ID) \
		-- claim_funds \
		--caller $(SOURCE) \
		--campaign_id $(CAMPAIGN_ID)
