"use client";

import { Navbar } from "@/components/Navbar";
import { Accordion, AccordionItem } from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

export default function FaqPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <main className="flex-1 container py-12">
        <div className="mx-auto max-w-2xl space-y-8">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-6 h-6 text-primary" />
              <h1 className="text-3xl font-bold tracking-tight">Frequently Asked Questions</h1>
            </div>
            <p className="text-muted-foreground">
              Everything you need to know about donating and creating campaigns on StellarGive.
            </p>
          </div>

          <Accordion>
            <AccordionItem question="How do donations work?" defaultOpen>
              <p>
                Campaigns accept a Stellar asset (a Soroban token / SAC). When you donate, your
                wallet signs a <code>donate</code> transaction that transfers tokens into the
                campaign&apos;s smart contract. Funds are held by the contract until the campaign is
                funded and the beneficiary claims them — no intermediary holds your money.
              </p>
            </AccordionItem>

            <AccordionItem question="What are Stroops?">
              <p>
                A stroop is the smallest unit of a Stellar asset: 1 token = 10,000,000 stroops
                (7 decimal places). Amounts are stored on-chain as integer stroops to avoid rounding
                errors, and the UI converts them to human-readable values for display.
              </p>
            </AccordionItem>

            <AccordionItem question="How do I get testnet XLM?">
              <p>
                StellarGive runs on the Stellar testnet. Fund a testnet account for free using
                Friendbot:{" "}
                <a
                  href="https://friendbot.stellar.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  friendbot.stellar.org
                </a>
                . You can also fund accounts from the{" "}
                <a
                  href="https://lab.stellar.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Stellar Lab
                </a>
                .
              </p>
            </AccordionItem>

            <AccordionItem question="Are donations refundable?">
              <p>
                It depends on the campaign&apos;s lifecycle. Funds are released to the beneficiary
                once a campaign reaches its goal and the beneficiary claims them. Always review a
                campaign&apos;s deadline and target before donating, since on-chain transfers are
                final.
              </p>
            </AccordionItem>

            <AccordionItem question="Which wallet do I need?">
              <p>
                You need the{" "}
                <a
                  href="https://www.freighter.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Freighter
                </a>{" "}
                browser extension. Connect it from the navbar, approve the testnet network, and
                you&apos;re ready to create campaigns and donate.
              </p>
            </AccordionItem>

            <AccordionItem question="Who can claim a campaign's funds?">
              <p>
                Only the beneficiary address set when the campaign was created can claim its funds,
                and only once the campaign is eligible. The claim is enforced by the smart contract,
                not by StellarGive.
              </p>
            </AccordionItem>

            <AccordionItem question="What are the fees?">
              <p>
                Stellar network fees are tiny (a fraction of a cent), paid in XLM when you sign a
                transaction. Before you sign, StellarGive simulates each transaction and warns you if
                the estimated resource fee is unusually high.
              </p>
            </AccordionItem>

            <AccordionItem question="How can I verify activity on-chain?">
              <p>
                Every campaign creation, donation, and claim emits a contract event. Browse them on
                the{" "}
                <a href="/activity" className="text-primary hover:underline">
                  Transaction History
                </a>{" "}
                page, and follow any address link to inspect it on{" "}
                <a
                  href="https://stellar.expert/explorer/testnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  StellarExpert
                </a>
                .
              </p>
            </AccordionItem>

            <AccordionItem question="What is Soroban?">
              <p>
                Soroban is Stellar&apos;s smart-contract platform. StellarGive&apos;s campaign logic
                is a Soroban contract written in Rust. Learn more in the{" "}
                <a
                  href="https://developers.stellar.org/docs/build/smart-contracts/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Stellar developer docs
                </a>
                .
              </p>
            </AccordionItem>
          </Accordion>
        </div>
      </main>
    </div>
  );
}
