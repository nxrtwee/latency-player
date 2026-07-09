import { WindowControls } from './WindowControls'

export function TitleBar(): JSX.Element {
  return (
    <div className="titlebar">
      <div className="tb-drag" />
      <WindowControls />
    </div>
  )
}
