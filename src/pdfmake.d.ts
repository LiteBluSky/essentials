// pdfmake's standard-font containers ship without types.
declare module 'pdfmake/build/standard-fonts/Courier' {
  import type { TFontContainer } from 'pdfmake/interfaces'

  const container: TFontContainer
  export default container
}
