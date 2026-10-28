/**
 * Runs every Storybook story as a test: renders it with the real preview decorators,
 * executes its play() interaction test, and checks the result with axe-core.
 */
import { composeStories } from '@storybook/react-vite'
import { render } from '@testing-library/react'
import type { FC } from 'react'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'

type StoryModule = Parameters<typeof composeStories>[0]
type RunnableStory = FC & { play?: (ctx: { canvasElement: HTMLElement }) => Promise<void> }
const modules = import.meta.glob<StoryModule>('../**/*.stories.tsx', { eager: true })

async function axeViolations(container: HTMLElement): Promise<string[]> {
  const result = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false }, // jsdom cannot compute styles; contrast is checked in Storybook's a11y panel
      region: { enabled: false }, // isolated components are not inside page landmarks
    },
  })
  return result.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`)
}

for (const [path, mod] of Object.entries(modules)) {
  const stories = composeStories(mod) as unknown as Record<string, RunnableStory>
  describe(path.replace('../', ''), () => {
    for (const [name, Story] of Object.entries(stories)) {
      it(`${name} renders, passes its interaction test and has no axe violations`, async () => {
        const { container } = render(<Story />)
        await Story.play?.({ canvasElement: container })
        expect(await axeViolations(document.body)).toEqual([])
      })
    }
  })
}
