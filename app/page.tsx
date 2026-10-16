import IllustrateLabApp from "@/components/IllustrateLabApp";

export default function HomePage() {
  const providerStatus = {
    cloudflare: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
    huggingFace: Boolean(process.env.HF_TOKEN),
  };

  return <IllustrateLabApp providerStatus={providerStatus} />;
}

