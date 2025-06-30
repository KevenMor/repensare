const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/api\.gptmaker\.ai\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'gptmaker-api',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60 // 24 hours
        }
      }
    },
    {
      urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'firestore-api',
        expiration: {
          maxEntries: 32,
          maxAgeSeconds: 24 * 60 * 60
        }
      }
    }
  ]
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['firebase-admin', '@ffmpeg/ffmpeg', '@ffmpeg/util'],
  // Desabilitar coleta de dados estáticos durante build para evitar erros com Firebase
  trailingSlash: false,
  generateBuildId: async () => {
    return 'build-' + Date.now()
  },
  // Não executar APIs durante build
  staticPageGenerationTimeout: 30,
  // Forçar todas as páginas a serem dinâmicas
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000']
    }
  },
  images: {
    domains: ['firebasestorage.googleapis.com'],
  },
  webpack: (config, { dev, isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        buffer: false,
        util: false,
        assert: false,
        http: false,
        https: false,
        os: false,
        url: false,
        zlib: false,
        querystring: false,
        path: false,
        child_process: false
      }
      
      // Permitir SharedArrayBuffer
      config.output.crossOriginLoading = 'anonymous'
    }
    
    // Ignorar módulos problemáticos do WhatsApp Web.js
    config.externals = config.externals || []
    config.externals.push({
      'fluent-ffmpeg': 'commonjs fluent-ffmpeg',
      'node-webpmux': 'commonjs node-webpmux',
      'sharp': 'commonjs sharp',
      'puppeteer': 'commonjs puppeteer'
    })
    
    // Resolver problemas específicos do fluent-ffmpeg
    config.resolve.alias = {
      ...config.resolve.alias,
      'fluent-ffmpeg': false
    }
    
    // Resolver problemas com undici/firebase
    config.module.rules.push({
      test: /\.m?js$/,
      include: /node_modules/,
      type: 'javascript/auto',
      resolve: {
        fullySpecified: false,
      },
    })
    
    return config
  },
  async headers() {
    return [
      {
        source: '/ffmpeg/:path*',
        headers: [
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
        ],
      },
    ]
  },
}

module.exports = withPWA(nextConfig) 