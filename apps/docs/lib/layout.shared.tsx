import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared'
import { repoUrl } from './shared'

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'Nepal Pay',
      url: '/',
    },
    githubUrl: repoUrl,
  }
}
