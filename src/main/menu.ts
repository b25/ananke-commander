import { Menu, app } from 'electron'

/** Standard Edit roles and macOS app menu so copy/paste and window shortcuts work like a native app. */
export function installAppMenu(): void {
  const isMac = process.platform === 'darwin'

  const edit: Electron.MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      ...(isMac ? ([{ role: 'pasteAndMatchStyle' }] as const) : []),
      { role: 'delete' },
      { type: 'separator' },
      { role: 'selectAll' }
    ]
  }

  if (isMac) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'services' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        },
        edit,
        {
          label: 'View',
          submenu: [
            ...(app.isPackaged
              ? []
              : ([
                  { role: 'toggleDevTools' },
                  { role: 'reload' },
                  { type: 'separator' }
                ] as const)),
            { role: 'togglefullscreen' }
          ]
        },
        {
          label: 'Window',
          submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        }
      ])
    )
    return
  }

  const winLinux: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }]
    },
    edit
  ]
  if (!app.isPackaged) {
    winLinux.push({
      label: 'View',
      submenu: [
        { role: 'toggleDevTools' },
        { role: 'reload' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(winLinux))
}
