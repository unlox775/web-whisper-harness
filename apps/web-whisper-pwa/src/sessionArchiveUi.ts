/**
 * Session zip import / export is a developer-mode debugging operation.
 * Gate both visibility and the actions on this flag — do not remove the feature.
 */
export function sessionArchiveToolsVisible(developerModeEnabled: boolean): boolean {
  return developerModeEnabled === true;
}
