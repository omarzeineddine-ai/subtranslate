/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit .next/standalone: a self-contained server with only the node_modules
  // it actually imports, so the Docker image can skip a second npm install and
  // ship a few dozen megabytes instead of the whole dependency tree.
  output: "standalone",
  // The regional variants used to slug with their parentheses; keep the
  // addresses already indexed and linked pointing at the pages that replaced
  // them. A crawler may send the parentheses percent-encoded, and the two
  // spellings match separately.
  async redirects() {
    const moved = [
      ["spanish-\\(spain\\)", "spanish-spain"],
      ["spanish-%28spain%29", "spanish-spain"],
      ["portuguese-\\(portugal\\)", "portuguese-portugal"],
      ["portuguese-%28portugal%29", "portuguese-portugal"],
    ];
    return moved.map(([from, to]) => ({
      source: `/translate-srt-to/${from}`,
      destination: `/translate-srt-to/${to}`,
      permanent: true,
    }));
  },
};

module.exports = nextConfig;
