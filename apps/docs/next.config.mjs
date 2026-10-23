import { createMDX } from 'fumadocs-mdx/next'

const basePath = process.env.DOCS_BASE_PATH ?? ''

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: true,
  trailingSlash: true,
}

const withMDX = createMDX()

export default withMDX(config)
