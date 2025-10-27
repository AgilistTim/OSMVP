import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig = (phase: string): NextConfig => {
	const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

	return {
		// Keep dev artifacts separate so production builds can't delete them mid-run.
		distDir: isDevServer ? ".next-dev" : ".next",
		// Ignore ESLint during builds (warnings won't fail the build)
		eslint: {
			ignoreDuringBuilds: true,
		},
	};
};

export default nextConfig;
