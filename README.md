# Deck Trello-style Checklists

Deck Trello-style Checklists adds checklists to [Nextcloud Deck](https://github.com/nextcloud/deck) cards. Deck itself is not patched. The checklists live in this app and are shown inside the Deck card sidebar and as a badge on the board.

A card can hold several checklists. Each checklist is a titled list of items you can check off, assign, date, reorder, and turn into its own Deck card.

## Requirements

- Nextcloud 35
- The Deck app enabled
- A logged-in user. Anonymous public shares are not supported.

The interface follows the account language. English and French are included.

## Install

Copy this directory to `custom_apps/deckchecklist` (or `apps/deckchecklist`) on the Nextcloud server, then enable it:

```bash
sudo -u www-data php occ app:enable deckchecklist
```

There is no entry in the Nextcloud app menu. Open a Deck board and a card. The checklists appear in the Details tab, under the description.

## On a card
![On a Card](/img/deckchecklist03.png)

Each checklist has a title, a progress bar with a completion percentage, and its items.

- Click a title or an item to rename it. Press Enter to save, Escape to cancel.
- Drag an item’s text to reorder it inside its checklist. Drag a checklist title to reorder checklists on the card.
- The item menu (⋮) assigns or removes people, sets or clears a due date, converts the item into a Deck card, or deletes the item.
- Assignees are shown with their Nextcloud avatar and status, the same way people are shown on a Deck card.
- A due date that is before today is highlighted while the item is still open.
- **Hide checked tasks** / **Show completed tasks** applies to that checklist only, and only when it has checked items.
- The chevron next to the title collapses the checklist. It starts expanded. Collapsing also hides the show/hide button. The progress bar stays visible.
- **Delete** removes that checklist.
- People who can edit the Deck card can change checklists. Everyone who can see the card can read them. An archived board or an archived card is read-only.

Converting an item creates a new card on the same list, copies the title (trimmed to Deck’s limit), the due date, and the assignees, then removes the checklist item.

The Deck description has its own small chevron, to the right of the word “Description”. It starts expanded. If the text is taller than the preview, **Show more** / **Show less** appears under it. Collapsing the description hides that button.

## On the board
![On the board](/img/deckchecklist02.png)

Cards that have checklist items show a badge in the card footer, using Deck’s checkbox icon and a `checked/total` count. The count covers every checklist on the card.

When every item is checked, the badge becomes a green pill with a white check mark and the same count.

## Notifications

Assigning a checklist item to someone else sends them a Nextcloud notification with a link to the card. Assigning an item to yourself does not. The notification is cleared when that person is unassigned, or when the item, its checklist, or the card is deleted. Converting an item into a card lets Deck send its own card-assignment notification.

## Permissions and cleanup

Access is decided by Deck. Reading a card requires Deck read access. Creating, editing, checking, reordering, or deleting requires Deck edit access.

When a Deck card is deleted, its checklists, items, assignees, and related notifications are deleted with it. Undoing the card deletion in Deck does not bring the checklists back. Deck’s own background purge of already deleted cards does not go through this app.

## What this app does not do

- It does not copy checklists when Deck clones a card.
- It does not show checklists on anonymous public shares.
- It does not add a due date or an assignee as a separate Deck card field. Those stay on the checklist item, except when you convert the item into a card.

## HTTP API

All routes are under `/apps/deckchecklist/` and require a logged-in session plus the usual Nextcloud `requesttoken` header.

- `GET /cards/{cardId}` — whether you can edit, the board members, and the checklists
- `POST /cards/{cardId}/lists` — create a checklist
- `PUT /lists/{listId}` — rename a checklist
- `DELETE /lists/{listId}` — delete a checklist
- `POST /lists/{listId}/items` — add an item
- `PUT /items/{itemId}` — update the title, checked state, or due date (`YYYY-MM-DD`, or empty to clear it)
- `DELETE /items/{itemId}` — delete an item
- `PUT /items/{itemId}/assignees` — replace the assignees (`userIds`)
- `POST /items/{itemId}/convert` — turn the item into a Deck card
- `PUT /lists/{listId}/reorder` — reorder items (`itemIds` must be a permutation)
- `PUT /cards/{cardId}/reorder` — reorder checklists
- `GET /boards/{boardId}/summary` — `{cardId: {checked, total}}` for the board badges

Deck edit permission is required for every change. A missing card or checklist returns 404. A user who cannot see the card receives 403.

## License

GNU Affero General Public License v3.0 only. See [LICENSE](LICENSE).
