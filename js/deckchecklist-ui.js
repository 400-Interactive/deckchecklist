(function () {
	const APP = 'deckchecklist'

	const ui = {
		cardId: null,
		canEdit: false,
		checklists: [],
		loaded: false,
		error: '',
		newListOpen: false,
		newListTitle: '',
		itemDrafts: {},
		editingList: null,
		editingItem: null,
		openMenu: null,
		members: [],
		justDragged: false,
		cancelEdit: false,
		hideChecked: {},
		collapsed: {},
		descriptions: {},
	}

	const summary = {}
	let summaryBoardId = null
	let stackCache = null
	let loadToken = 0
	let dragging = null
	let dragKind = null
	let dropped = false
	let rendering = false

	function tr(text, vars) {
		let translated = text
		if (typeof window.t === 'function') {
			translated = window.t(APP, text)
		}
		if (vars) {
			Object.keys(vars).forEach(function (key) {
				translated = translated.split('{' + key + '}').join(String(vars[key]))
			})
		}
		return translated
	}

	function requestToken() {
		if (window.OC && OC.requestToken) {
			return OC.requestToken
		}
		const input = document.getElementById('requesttoken')
		return input ? input.value : ''
	}

	function appUrl(path) {
		if (window.OC && typeof OC.generateUrl === 'function') {
			return OC.generateUrl('/apps/' + APP + path)
		}
		const webroot = (window.OC && OC.webroot) || ''
		return webroot + '/index.php/apps/' + APP + path
	}

	function deckUrl(path) {
		if (window.OC && typeof OC.generateUrl === 'function') {
			return OC.generateUrl('/apps/deck' + path)
		}
		const webroot = (window.OC && OC.webroot) || ''
		return webroot + '/index.php/apps/deck' + path
	}

	async function api(path, options) {
		const opts = options || {}
		const headers = {
			Accept: 'application/json',
			requesttoken: requestToken(),
		}
		if (opts.body) {
			headers['Content-Type'] = 'application/json'
		}
		const response = await fetch(appUrl(path), {
			method: opts.method || 'GET',
			headers: headers,
			body: opts.body ? JSON.stringify(opts.body) : undefined,
		})
		let data = null
		try {
			data = await response.json()
		} catch (error) {
			data = null
		}
		if (!response.ok) {
			const failure = new Error((data && data.message) || 'Request failed')
			failure.status = response.status
			throw failure
		}
		return data
	}

	function parseLocation() {
		const hash = window.location.hash || ''
		const path = hash.startsWith('#') ? hash.slice(1) : window.location.pathname
		const card = path.match(/\/board\/(\d+)\/card\/(\d+)/)
		const board = path.match(/\/board\/(\d+)/)
		return {
			boardId: card ? Number(card[1]) : (board ? Number(board[1]) : null),
			cardId: card ? Number(card[2]) : null,
		}
	}

	function el(tag, className, attrs) {
		const node = document.createElement(tag)
		if (className) {
			node.className = className
		}
		if (attrs) {
			Object.keys(attrs).forEach(function (key) {
				if (attrs[key] !== null && attrs[key] !== undefined) {
					node.setAttribute(key, String(attrs[key]))
				}
			})
		}
		return node
	}

	function descriptionNode() {
		const nodes = document.querySelectorAll('[data-test="description"]')
		return nodes.length ? nodes[nodes.length - 1] : null
	}

	function descriptionState() {
		const key = String(ui.cardId || '')
		if (!ui.descriptions[key]) {
			ui.descriptions[key] = { collapsed: false, more: false }
		}
		return ui.descriptions[key]
	}

	function descriptionAnchor(desc) {
		if (!desc) {
			return null
		}
		const more = desc.nextElementSibling
		if (more && more.dataset && more.dataset.action === 'toggle-description-more') {
			return more
		}
		return desc
	}

	const DESCRIPTION_LIMIT = 220

	function releaseDescription() {
		document.querySelectorAll('.deckcl-desc').forEach(function (wrap) {
			const desc = wrap.querySelector('[data-test="description"]')
			if (desc && wrap.parentElement) {
				wrap.parentElement.insertBefore(desc, wrap)
			}
			wrap.remove()
		})
	}

	function descriptionChevron(desc) {
		const heading = desc.querySelector('h5')
		if (!heading) {
			return null
		}
		let chevron = heading.querySelector('[data-action="toggle-description"]')
		if (!chevron) {
			chevron = el('button', 'deckcl-desc__chevron', {
				type: 'button',
				'data-action': 'toggle-description',
			})
			chevron.appendChild(el('span', 'deckcl__chevron-icon'))
			const title = [...heading.childNodes].find(function (node) {
				return node.nodeType === 3 && node.textContent.trim()
			})
			if (title && title.nextSibling) {
				heading.insertBefore(chevron, title.nextSibling)
			} else {
				heading.appendChild(chevron)
			}
		}
		return chevron
	}

	function descriptionMore(desc) {
		const next = desc.nextElementSibling
		if (next && next.dataset && next.dataset.action === 'toggle-description-more') {
			return next
		}
		document.querySelectorAll('[data-action="toggle-description-more"]').forEach(function (button) {
			button.remove()
		})
		const more = el('button', 'deckcl-desc__more', {
			type: 'button',
			'data-action': 'toggle-description-more',
		})
		more.appendChild(el('span', 'deckcl__chevron-icon'))
		more.appendChild(el('span', 'deckcl-desc__more-label'))
		desc.insertAdjacentElement('afterend', more)
		return more
	}

	function syncDescription() {
		releaseDescription()
		const desc = descriptionNode()
		if (!desc || !desc.isConnected || !ui.cardId || !desc.querySelector('h5')) {
			return
		}
		descriptionChevron(desc)
		applyDescription(desc, descriptionMore(desc))
	}

	function applyDescription(desc, more) {
		const state = descriptionState()
		const text = desc.querySelector('.description__text')
		const chevron = desc.querySelector('[data-action="toggle-description"]')
		desc.classList.toggle('deckcl-desc-collapsed', !!state.collapsed)
		if (chevron) {
			const expanded = state.collapsed ? 'false' : 'true'
			const label = state.collapsed ? tr('Expand description') : tr('Collapse description')
			if (chevron.getAttribute('aria-expanded') !== expanded) {
				chevron.setAttribute('aria-expanded', expanded)
			}
			if (chevron.getAttribute('aria-label') !== label) {
				chevron.setAttribute('aria-label', label)
			}
		}
		if (!text || state.collapsed) {
			desc.classList.remove('deckcl-desc-clamp')
			if (more) {
				more.hidden = true
			}
			return
		}
		desc.classList.toggle('deckcl-desc-clamp', !state.more)
		const tall = text.scrollHeight > DESCRIPTION_LIMIT + 8
		if (more) {
			more.hidden = !tall && !state.more
			more.classList.toggle('deckcl-desc__more--open', !!state.more)
			const label = more.querySelector('.deckcl-desc__more-label')
			const nextLabel = state.more ? tr('Show less') : tr('Show more')
			if (label && label.textContent !== nextLabel) {
				label.textContent = nextLabel
			}
		}
	}

	document.addEventListener('click', function (event) {
		const action = event.target.closest && event.target.closest('[data-action="toggle-description"], [data-action="toggle-description-more"]')
		if (!action) {
			return
		}
		event.preventDefault()
		event.stopPropagation()
		const state = descriptionState()
		if (action.dataset.action === 'toggle-description') {
			state.collapsed = !state.collapsed
		} else {
			state.more = !state.more
		}
		const desc = descriptionNode()
		if (desc) {
			applyDescription(desc, descriptionMore(desc))
		}
	}, true)

	function currentPanel() {
		return document.querySelector('.deckcl')
	}

	function captureFocus() {
		const active = document.activeElement
		if (!active || !active.closest || !active.closest('.deckcl')) {
			return null
		}
		return {
			key: active.dataset.focusKey || '',
			start: active.selectionStart,
			end: active.selectionEnd,
		}
	}

	function restoreFocus(panel, focus) {
		if (!focus || !focus.key) {
			return
		}
		const node = panel.querySelector('[data-focus-key="' + CSS.escape(focus.key) + '"]')
		if (!node) {
			return
		}
		node.focus()
		if (typeof focus.start === 'number' && node.setSelectionRange) {
			const end = typeof focus.end === 'number' ? focus.end : focus.start
			try {
				node.setSelectionRange(focus.start, end)
			} catch (error) {
				// Some input types reject a selection range.
			}
		}
	}

	function itemOrder(listId, visibleIds) {
		const list = ui.checklists.find(function (entry) {
			return entry.id === listId
		})
		if (!list) {
			return visibleIds
		}
		const shown = {}
		visibleIds.forEach(function (id) {
			shown[id] = true
		})
		let index = 0
		const order = list.items.map(function (item) {
			if (!shown[item.id]) {
				const id = item.id
				return id
			}
			const id = visibleIds[index]
			index += 1
			return id
		})
		if (index !== visibleIds.length) {
			return visibleIds
		}
		return order
	}

	function listStats(list) {
		const total = list.items.length
		const checked = list.items.filter(function (item) {
			return item.checked
		}).length
		return { checked: checked, total: total }
	}

	function rememberSummary(cardId, checklists) {
		let checked = 0
		let total = 0
		checklists.forEach(function (list) {
			const stats = listStats(list)
			checked += stats.checked
			total += stats.total
		})
		if (total > 0) {
			summary[String(cardId)] = { checked: checked, total: total }
		} else {
			delete summary[String(cardId)]
		}
	}

	function applyPayload(data) {
		ui.canEdit = !!(data && data.canEdit)
		ui.members = (data && data.members) || []
		ui.checklists = (data && data.checklists) || []
		ui.error = ''
		ui.loaded = true
		if (ui.cardId) {
			rememberSummary(ui.cardId, ui.checklists)
		}
		render()
		paintBadges()
		scheduleBoard()
	}

	function showSaveError() {
		ui.error = tr('Could not save the checklist')
		render()
	}

	async function loadCard(cardId) {
		const token = ++loadToken
		ui.cardId = cardId
		ui.loaded = false
		ui.error = ''
		ui.checklists = []
		ui.newListOpen = false
		ui.newListTitle = tr('Checklist')
		ui.itemDrafts = {}
		ui.editingList = null
		ui.editingItem = null
		ui.openMenu = null
		ui.members = []
		render()
		try {
			const data = await api('/cards/' + cardId)
			if (token !== loadToken || parseLocation().cardId !== cardId) {
				return
			}
			applyPayload(data)
		} catch (error) {
			if (token !== loadToken || parseLocation().cardId !== cardId) {
				return
			}
			ui.loaded = true
			ui.canEdit = false
			ui.checklists = []
			ui.error = tr('Could not load checklists')
			render()
		}
	}

	function buildPanel() {
		const fragment = document.createDocumentFragment()
		const heading = el('div', 'deckcl__heading')
		const title = el('h5')
		title.textContent = tr('Checklists')
		heading.appendChild(title)
		if (ui.canEdit && !ui.newListOpen) {
			const add = el('button', 'button deckcl__add', { type: 'button', 'data-action': 'open-list' })
			add.textContent = tr('Add a checklist')
			heading.appendChild(add)
		}
		fragment.appendChild(heading)

		if (ui.error) {
			const error = el('p', 'deckcl__error')
			error.textContent = ui.error
			fragment.appendChild(error)
		}
		if (!ui.loaded) {
			const loading = el('p', 'deckcl__loading')
			loading.textContent = tr('Loading checklists…')
			fragment.appendChild(loading)
			return fragment
		}

		if (ui.canEdit && ui.newListOpen) {
			const form = el('form', 'deckcl__new-list')
			const input = el('input', 'deckcl__add-input', {
				type: 'text',
				'data-focus-key': 'new-list',
				'aria-label': tr('Checklist name'),
				maxlength: '255',
			})
			input.value = ui.newListTitle
			const confirm = el('button', 'button primary', { type: 'submit' })
			confirm.textContent = tr('Add a checklist')
			form.append(input, confirm)
			fragment.appendChild(form)
		}

		ui.checklists.forEach(function (list) {
			fragment.appendChild(buildList(list))
		})
		return fragment
	}

	function todayIso() {
		const date = new Date()
		const month = String(date.getMonth() + 1).padStart(2, '0')
		const day = String(date.getDate()).padStart(2, '0')
		return date.getFullYear() + '-' + month + '-' + day
	}

	function formatDate(iso) {
		const parts = String(iso).split('-')
		if (parts.length !== 3) {
			return iso
		}
		const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
		return date.toLocaleDateString()
	}

	function avatarUrl(uid) {
		if (window.OC && typeof OC.generateUrl === 'function') {
			return OC.generateUrl('/avatar/{user}/{size}', { user: uid, size: 64 })
		}
		return '/index.php/avatar/' + encodeURIComponent(uid) + '/64'
	}

	function buildAvatar(person, onLine) {
		const wrap = el('span', 'deckcl__avatar-wrap' + (onLine ? ' deckcl__avatar-wrap--line' : ''))
		const img = el('img', 'deckcl__avatar', { alt: '', src: avatarUrl(person.uid) })
		img.draggable = false
		wrap.title = person.displayName || person.uid
		wrap.appendChild(img)
		if (person.status) {
			wrap.appendChild(el('span', 'deckcl__status deckcl__status--' + person.status))
		}
		return wrap
	}

	function listKey(listId) {
		return String(listId)
	}

	function buildList(list) {
		const stats = listStats(list)
		const collapsed = !!ui.collapsed[listKey(list.id)]
		const hidden = !!ui.hideChecked[listKey(list.id)]
		const article = el('article', 'deckcl__list' + (collapsed ? ' deckcl__list--collapsed' : ''), { 'data-list-id': list.id })
		const head = el('div', 'deckcl__list-head')
		const chevron = el('button', 'deckcl__chevron', {
			type: 'button',
			'data-action': 'toggle-collapse',
			'data-list-id': list.id,
			'aria-expanded': collapsed ? 'false' : 'true',
			'aria-label': collapsed ? tr('Expand checklist') : tr('Collapse checklist'),
		})
		chevron.appendChild(el('span', 'deckcl__chevron-icon'))
		head.appendChild(chevron)
		head.appendChild(buildListTitle(list))
		const actions = el('span', 'deckcl__list-actions')
		if (!collapsed && stats.checked > 0) {
			const toggle = el('button', 'button deckcl__list-button', {
				type: 'button',
				'data-action': 'toggle-checked',
				'data-list-id': list.id,
				'aria-pressed': hidden ? 'true' : 'false',
			})
			toggle.textContent = hidden
				? tr('Show completed tasks ({count})', { count: stats.checked })
				: tr('Hide checked tasks')
			actions.appendChild(toggle)
		}
		if (ui.canEdit) {
			const remove = el('button', 'button deckcl__list-button', {
				type: 'button',
				'data-action': 'delete-list',
				'data-list-id': list.id,
				'aria-label': tr('Delete checklist'),
			})
			remove.textContent = tr('Delete')
			actions.appendChild(remove)
		}
		head.appendChild(actions)
		article.appendChild(head)

		const percent = stats.total ? Math.round((stats.checked / stats.total) * 100) : 0
		const progress = el('div', 'deckcl__progress')
		const bar = el('div', 'deckcl__bar')
		const fill = el('span')
		fill.style.width = percent + '%'
		bar.appendChild(fill)
		const label = el('span', 'deckcl__percent')
		label.textContent = percent + '%'
		label.title = tr('Progress')
		progress.append(bar, label)
		article.appendChild(progress)

		if (collapsed) {
			return article
		}

		const items = el('ul', 'deckcl__items')
		list.items.forEach(function (item) {
			if (hidden && item.checked) {
				return
			}
			items.appendChild(buildItem(item))
		})
		article.appendChild(items)

		if (ui.canEdit) {
			const form = el('form', 'deckcl__add-item')
			const input = el('input', 'deckcl__add-input', {
				type: 'text',
				'data-focus-key': 'item-draft-' + list.id,
				'data-draft-list': String(list.id),
				'aria-label': tr('Add an item'),
				placeholder: tr('Add an item'),
				maxlength: '1000',
			})
			input.value = ui.itemDrafts[String(list.id)] || ''
			form.appendChild(input)
			form.dataset.listId = String(list.id)
			article.appendChild(form)
		}
		return article
	}

	function buildListTitle(list) {
		if (ui.canEdit && ui.editingList === list.id) {
			const input = el('input', 'deckcl__list-title', {
				type: 'text',
				'data-focus-key': 'list-title-' + list.id,
				'data-list-title': String(list.id),
				'aria-label': tr('Rename checklist'),
				maxlength: '255',
			})
			input.value = list.title
			return input
		}
		const title = el('span', 'deckcl__text deckcl__list-title', {
			'data-list-id': list.id,
		})
		title.textContent = list.title
		if (ui.canEdit) {
			title.draggable = true
			title.dataset.drag = 'list'
			title.dataset.action = 'edit-list'
			title.tabIndex = 0
			title.setAttribute('role', 'button')
			title.title = tr('Rename checklist')
		}
		return title
	}

	function buildItem(item) {
		const row = el('li', 'deckcl__item' + (item.checked ? ' deckcl__item--checked' : ''), { 'data-item-id': item.id })
		const box = el('input', 'deckcl__check', {
			type: 'checkbox',
			'data-item-id': item.id,
		})
		box.checked = !!item.checked
		box.disabled = !ui.canEdit
		row.appendChild(box)
		row.appendChild(buildItemTitle(item))
		const meta = buildItemMeta(item)
		if (meta.childNodes.length) {
			row.appendChild(meta)
		}
		if (ui.canEdit) {
			const menuButton = el('button', 'deckcl__icon-button', {
				type: 'button',
				'data-action': 'menu',
				'data-item-id': item.id,
				'aria-label': tr('Item actions'),
				'aria-expanded': ui.openMenu === item.id ? 'true' : 'false',
			})
			menuButton.textContent = '⋮'
			row.appendChild(menuButton)
			if (ui.openMenu === item.id) {
				row.appendChild(buildMenu(item))
			}
		}
		return row
	}

	function buildItemTitle(item) {
		if (ui.canEdit && ui.editingItem === item.id) {
			const input = el('input', 'deckcl__item-title', {
				type: 'text',
				'data-focus-key': 'item-title-' + item.id,
				'data-item-title': String(item.id),
				'aria-label': tr('Item title'),
				maxlength: '1000',
			})
			input.value = item.title
			return input
		}
		const title = el('span', 'deckcl__text', { 'data-item-id': item.id })
		title.textContent = item.title
		if (ui.canEdit) {
			title.draggable = true
			title.dataset.drag = 'item'
			title.dataset.action = 'edit-item'
			title.tabIndex = 0
			title.setAttribute('role', 'button')
		}
		return title
	}

	function buildItemMeta(item) {
		const meta = el('span', 'deckcl__meta')
		if (item.duedate) {
			const due = el('span', 'deckcl__due' + (!item.checked && item.duedate < todayIso() ? ' deckcl__due--late' : ''))
			due.textContent = formatDate(item.duedate)
			meta.appendChild(due)
		}
		if ((item.assignees || []).length) {
			const avatars = el('span', 'deckcl__avatars')
			item.assignees.forEach(function (person) {
				avatars.appendChild(buildAvatar(person, true))
			})
			meta.appendChild(avatars)
		}
		return meta
	}

	function buildMenu(item) {
		const menu = el('div', 'deckcl__menu')
		const assignLabel = el('p', 'deckcl__menu-label')
		assignLabel.textContent = tr('Assign')
		menu.appendChild(assignLabel)
		const people = menuPeople(item)
		if (!people.length) {
			const empty = el('p', 'deckcl__menu-empty')
			empty.textContent = tr('No one can be assigned')
			menu.appendChild(empty)
		}
		people.forEach(function (person) {
			const label = el('label', 'deckcl__person')
			label.appendChild(buildAvatar(person, false))
			const name = el('span', 'deckcl__person-name')
			name.textContent = person.displayName
			const box = el('input', null, { type: 'checkbox', value: person.uid })
			box.checked = (item.assignees || []).some(function (assignee) {
				return assignee.uid === person.uid
			})
			box.setAttribute('aria-label', person.displayName)
			label.append(name, box)
			menu.appendChild(label)
		})
		const dateLabel = el('p', 'deckcl__menu-label')
		dateLabel.textContent = tr('Due date')
		const date = el('input', 'deckcl__due-input', {
			type: 'date',
			'data-item-id': item.id,
			'aria-label': tr('Due date'),
		})
		if (item.duedate) {
			date.value = item.duedate
		}
		menu.append(dateLabel, date)
		if (item.duedate) {
			const clear = el('button', 'deckcl__menu-action', {
				type: 'button',
				'data-action': 'clear-date',
				'data-item-id': item.id,
			})
			clear.textContent = tr('Clear date')
			menu.appendChild(clear)
		}
		const convert = el('button', 'deckcl__menu-action', {
			type: 'button',
			'data-action': 'convert-item',
			'data-item-id': item.id,
		})
		convert.textContent = tr('Convert to card')
		const remove = el('button', 'deckcl__menu-action deckcl__menu-action--danger', {
			type: 'button',
			'data-action': 'delete-item',
			'data-item-id': item.id,
		})
		remove.textContent = tr('Delete')
		menu.append(convert, remove)
		return menu
	}

	function menuPeople(item) {
		const people = ui.members.map(function (member) {
			return { uid: member.uid, displayName: member.displayName, status: member.status || null }
		})
		const known = {}
		people.forEach(function (person) {
			known[person.uid] = true
		})
		;(item.assignees || []).forEach(function (person) {
			if (!known[person.uid]) {
				people.push(person)
			}
		})
		return people
	}

	function placeMenu(panel) {
		const menu = panel.querySelector('.deckcl__menu')
		const button = ui.openMenu === null ? null : panel.querySelector('[data-action="menu"][data-item-id="' + ui.openMenu + '"]')
		if (!menu || !button) {
			return
		}
		const rect = button.getBoundingClientRect()
		menu.style.position = 'fixed'
		const top = Math.min(rect.bottom + 4, Math.max(8, window.innerHeight - menu.offsetHeight - 8))
		menu.style.top = top + 'px'
		menu.style.left = 'auto'
		menu.style.right = Math.max(8, window.innerWidth - rect.right) + 'px'
	}

	function render() {
		const desc = descriptionNode()
		if (!desc || !ui.cardId) {
			const stale = currentPanel()
			if (stale) {
				stale.remove()
			}
			return
		}
		rendering = true
		syncDescription()
		const focus = captureFocus()
		let panel = currentPanel()
		if (!panel || Number(panel.dataset.cardId) !== ui.cardId) {
			if (panel) {
				panel.remove()
			}
			panel = el('section', 'deckcl', { 'data-card-id': ui.cardId })
			bindPanel(panel)
		}
		panel.dataset.cardId = String(ui.cardId)
		const anchor = descriptionAnchor(desc)
		if (panel.previousElementSibling !== anchor) {
			anchor.insertAdjacentElement('afterend', panel)
		}
		panel.replaceChildren(buildPanel())
		restoreFocus(panel, focus)
		placeMenu(panel)
		rendering = false
	}

	function ensureMounted() {
		if (rendering || dragging || !ui.cardId || !ui.loaded) {
			return
		}
		const desc = descriptionNode()
		const panel = currentPanel()
		if (!desc) {
			return
		}
		syncDescription()
		const anchor = descriptionAnchor(desc)
		if (!panel || !panel.isConnected || panel.previousElementSibling !== anchor || Number(panel.dataset.cardId) !== ui.cardId) {
			render()
		}
	}

	function bindPanel(panel) {
		panel.addEventListener('click', function (event) {
			event.stopPropagation()
			if (ui.justDragged) {
				ui.justDragged = false
				return
			}
			const action = event.target.closest('[data-action]')
			const inMenu = event.target.closest('.deckcl__menu')
			const keepMenu = inMenu || (action && action.dataset.action === 'menu')
			if (ui.openMenu !== null && !keepMenu) {
				ui.openMenu = null
				if (!action && !(event.target && event.target.type === 'checkbox')) {
					render()
					return
				}
			}
			if (action && action.dataset.action === 'toggle-checked') {
				const key = listKey(action.dataset.listId)
				ui.hideChecked[key] = !ui.hideChecked[key]
				ui.openMenu = null
				ui.editingItem = null
				render()
				return
			}
			if (action && action.dataset.action === 'toggle-collapse') {
				const key = listKey(action.dataset.listId)
				ui.collapsed[key] = !ui.collapsed[key]
				ui.openMenu = null
				ui.editingItem = null
				render()
				return
			}
			if (!action || !ui.canEdit) {
				return
			}
			if (action.dataset.action === 'open-list') {
				ui.newListOpen = true
				ui.newListTitle = tr('Checklist')
				ui.editingList = null
				render()
				const input = panel.querySelector('[data-focus-key="new-list"]')
				if (input) {
					input.focus()
					input.select()
				}
			}
			if (action.dataset.action === 'edit-list') {
				ui.editingList = Number(action.dataset.listId)
				ui.editingItem = null
				ui.openMenu = null
				render()
				const input = panel.querySelector('[data-focus-key="list-title-' + ui.editingList + '"]')
				if (input) {
					input.focus()
					input.select()
				}
			}
			if (action.dataset.action === 'edit-item') {
				ui.editingItem = Number(action.dataset.itemId)
				ui.editingList = null
				ui.openMenu = null
				render()
				const input = panel.querySelector('[data-focus-key="item-title-' + ui.editingItem + '"]')
				if (input) {
					input.focus()
					input.select()
				}
			}
			if (action.dataset.action === 'menu') {
				const itemId = Number(action.dataset.itemId)
				ui.openMenu = ui.openMenu === itemId ? null : itemId
				ui.editingItem = null
				ui.editingList = null
				render()
			}
			if (action.dataset.action === 'delete-list') {
				const listId = Number(action.dataset.listId)
				if (window.confirm(tr('Delete this checklist?'))) {
					run(function () {
						return api('/lists/' + listId, { method: 'DELETE' }).then(applyPayload)
					})
				}
			}
			if (action.dataset.action === 'delete-item') {
				const itemId = Number(action.dataset.itemId)
				ui.openMenu = null
				run(function () {
					return api('/items/' + itemId, { method: 'DELETE' }).then(applyPayload)
				})
			}
			if (action.dataset.action === 'clear-date') {
				saveItemDate(Number(action.dataset.itemId), null)
			}
			if (action.dataset.action === 'convert-item') {
				const itemId = Number(action.dataset.itemId)
				if (window.confirm(tr('Convert this item into a card?'))) {
					ui.openMenu = null
					run(function () {
						return api('/items/' + itemId + '/convert', { method: 'POST' }).then(function () {
							window.location.reload()
						})
					})
				}
			}
		})

		panel.addEventListener('keydown', function (event) {
			event.stopPropagation()
			const target = event.target
			if (!target || !target.dataset) {
				return
			}
			if (event.key === 'Escape' && target.dataset.focusKey === 'new-list') {
				ui.newListOpen = false
				render()
			}
			if (event.key === 'Enter' && (target.dataset.action === 'edit-list' || target.dataset.action === 'edit-item')) {
				event.preventDefault()
				target.click()
			}
			if (event.key === 'Escape' && (target.dataset.listTitle || target.dataset.itemTitle)) {
				event.preventDefault()
				ui.cancelEdit = true
				ui.editingList = null
				ui.editingItem = null
				render()
			}
			if (event.key === 'Enter' && (target.dataset.listTitle || target.dataset.itemTitle)) {
				event.preventDefault()
				target.blur()
			}
		})

		panel.addEventListener('input', function (event) {
			const input = event.target
			if (!input || !input.dataset) {
				return
			}
			if (input.dataset.focusKey === 'new-list') {
				ui.newListTitle = input.value
			}
			if (input.dataset.draftList) {
				ui.itemDrafts[input.dataset.draftList] = input.value
			}
		})

		function submitForm(form) {
			if (!form || form.dataset.sending === '1' || !ui.canEdit) {
				return
			}
			const input = form.querySelector('input')
			const title = input ? input.value.trim() : ''
			if (form.classList.contains('deckcl__new-list')) {
				if (!title || !ui.cardId) {
					return
				}
				form.dataset.sending = '1'
				ui.newListTitle = title
				run(function () {
					return api('/cards/' + ui.cardId + '/lists', { method: 'POST', body: { title: title } }).then(function (data) {
						ui.newListOpen = false
						applyPayload(data)
					})
				})
			}
			if (form.classList.contains('deckcl__add-item')) {
				const listId = Number(form.dataset.listId)
				if (!title) {
					return
				}
				form.dataset.sending = '1'
				run(function () {
					return api('/lists/' + listId + '/items', { method: 'POST', body: { title: title } }).then(function (data) {
						delete ui.itemDrafts[String(listId)]
						applyPayload(data)
						const next = document.querySelector('[data-focus-key="item-draft-' + listId + '"]')
						if (next) {
							next.focus()
						}
					})
				})
			}
		}

		panel.addEventListener('submit', function (event) {
			event.preventDefault()
			submitForm(event.target)
		})

		panel.addEventListener('keydown', function (event) {
			if (event.key !== 'Enter' || !event.target || !event.target.closest) {
				return
			}
			const form = event.target.closest('form')
			if (!form || !panel.contains(form)) {
				return
			}
			event.preventDefault()
			submitForm(form)
		})

		panel.addEventListener('change', function (event) {
			const box = event.target
			if (!box || !box.classList || !ui.canEdit) {
				return
			}
			if (box.classList.contains('deckcl__check')) {
				const itemId = Number(box.dataset.itemId)
				const item = findItem(itemId)
				if (!item) {
					return
				}
				run(function () {
					return api('/items/' + itemId, {
						method: 'PUT',
						body: { title: item.title, checked: box.checked ? 1 : 0 },
					}).then(applyPayload)
				})
			}
			if (box.closest && box.closest('.deckcl__person')) {
				const menu = box.closest('.deckcl__menu')
				const itemId = ui.openMenu
				if (!menu || itemId === null) {
					return
				}
				const userIds = [...menu.querySelectorAll('.deckcl__person input:checked')].map(function (input) {
					return input.value
				})
				run(function () {
					return api('/items/' + itemId + '/assignees', { method: 'PUT', body: { userIds: userIds } }).then(applyPayload)
				})
			}
			if (box.classList.contains('deckcl__due-input')) {
				saveItemDate(Number(box.dataset.itemId), box.value || null)
			}
		})

		panel.addEventListener('focusout', function (event) {
			const input = event.target
			if (!input || !input.dataset || !ui.canEdit) {
				return
			}
			if (ui.cancelEdit) {
				ui.cancelEdit = false
				return
			}
			if (input.dataset.listTitle) {
				const listId = Number(input.dataset.listTitle)
				const list = ui.checklists.find(function (entry) {
					return entry.id === listId
				})
				const title = input.value.trim()
				ui.editingList = null
				if (list && title && title !== list.title) {
					run(function () {
						return api('/lists/' + listId, { method: 'PUT', body: { title: title } }).then(applyPayload)
					})
				} else {
					closeEditSoon()
				}
			}
			if (input.dataset.itemTitle) {
				const itemId = Number(input.dataset.itemTitle)
				const item = findItem(itemId)
				const title = input.value.trim()
				ui.editingItem = null
				if (item && title && title !== item.title) {
					run(function () {
						return api('/items/' + itemId, {
							method: 'PUT',
							body: { title: title, checked: item.checked ? 1 : 0 },
						}).then(applyPayload)
					})
				} else {
					closeEditSoon()
				}
			}
		})

		panel.addEventListener('dragstart', function (event) {
			const handle = event.target.closest ? event.target.closest('[data-drag]') : null
			if (!handle || !ui.canEdit) {
				return
			}
			dragKind = handle.dataset.drag
			dragging = dragKind === 'list' ? handle.closest('.deckcl__list') : handle.closest('.deckcl__item')
			if (!dragging) {
				dragKind = null
				return
			}
			dropped = false
			dragging.classList.add('deckcl--dragging')
			if (event.dataTransfer) {
				event.dataTransfer.effectAllowed = 'move'
				event.dataTransfer.setData('text/plain', dragKind)
				if (event.dataTransfer.setDragImage) {
					event.dataTransfer.setDragImage(dragging, 12, 12)
				}
			}
		})

		panel.addEventListener('dragover', function (event) {
			if (!dragging) {
				return
			}
			event.preventDefault()
			if (dragKind === 'list') {
				const list = event.target.closest ? event.target.closest('.deckcl__list') : null
				if (!list || list === dragging) {
					return
				}
				const rect = list.getBoundingClientRect()
				const after = event.clientY > rect.top + rect.height / 2
				list.parentElement.insertBefore(dragging, after ? list.nextSibling : list)
				return
			}
			const item = event.target.closest ? event.target.closest('.deckcl__item') : null
			if (!item || item === dragging || item.parentElement !== dragging.parentElement) {
				return
			}
			const rect = item.getBoundingClientRect()
			const after = event.clientY > rect.top + rect.height / 2
			item.parentElement.insertBefore(dragging, after ? item.nextSibling : item)
		})

		panel.addEventListener('drop', function (event) {
			if (!dragging) {
				return
			}
			event.preventDefault()
			dropped = true
			const node = dragging
			const kind = dragKind
			dragging = null
			dragKind = null
			node.classList.remove('deckcl--dragging')
			if (kind === 'list') {
				const ids = [...panel.querySelectorAll('.deckcl__list')].map(function (list) {
					return Number(list.dataset.listId)
				})
				run(function () {
					return api('/cards/' + ui.cardId + '/reorder', { method: 'PUT', body: { listIds: ids } }).then(applyPayload)
				})
				return
			}
			const listEl = node.closest('.deckcl__list')
			const listId = Number(listEl.dataset.listId)
			const visibleIds = [...listEl.querySelectorAll('.deckcl__item')].map(function (item) {
				return Number(item.dataset.itemId)
			})
			const ids = itemOrder(listId, visibleIds)
			run(function () {
				return api('/lists/' + listId + '/reorder', { method: 'PUT', body: { itemIds: ids } }).then(applyPayload)
			})
		})

		panel.addEventListener('dragend', function () {
			if (dragging) {
				dragging.classList.remove('deckcl--dragging')
			}
			const shouldReload = dragging && !dropped
			dragging = null
			dragKind = null
			dropped = false
			ui.justDragged = true
			setTimeout(function () {
				ui.justDragged = false
			}, 50)
			if (shouldReload && ui.cardId) {
				loadCard(ui.cardId)
			}
		})
	}

	function closeEditSoon() {
		setTimeout(function () {
			if (ui.editingList === null && ui.editingItem === null) {
				render()
			}
		}, 0)
	}

	function saveItemDate(itemId, duedate) {
		const item = findItem(itemId)
		if (!item) {
			return
		}
		run(function () {
			return api('/items/' + itemId, {
				method: 'PUT',
				body: { title: item.title, checked: item.checked ? 1 : 0, duedate: duedate },
			}).then(applyPayload)
		})
	}

	function findItem(itemId) {
		for (let i = 0; i < ui.checklists.length; i++) {
			const found = ui.checklists[i].items.find(function (item) {
				return item.id === itemId
			})
			if (found) {
				return found
			}
		}
		return null
	}

	function run(action) {
		return Promise.resolve()
			.then(action)
			.catch(function () {
				showSaveError()
			})
	}

	function domStacks() {
		return [...document.querySelectorAll('.stack')].filter(function (stack) {
			return stack.querySelector('.dnd-container')
		})
	}

	function domCards(stack) {
		return [...stack.querySelectorAll('.card')].filter(function (card) {
			return card.closest('.stack') === stack
		})
	}

	function assignCardIds(domStackEls, apiStacks) {
		if (!Array.isArray(apiStacks)) {
			return
		}
		const remaining = [...apiStacks].sort(function (a, b) {
			return (Number(a.order) || 0) - (Number(b.order) || 0) || Number(a.id) - Number(b.id)
		})
		domStackEls.forEach(function (domStack) {
			const title = domStack.getAttribute('data-cy-stack')
			const index = remaining.findIndex(function (stack) {
				return stack.title === title
			})
			if (index === -1) {
				return
			}
			const apiStack = remaining.splice(index, 1)[0]
			const apiCards = [...(apiStack.cards || [])].sort(function (a, b) {
				return (Number(a.order) || 0) - (Number(b.order) || 0) || Number(a.id) - Number(b.id)
			})
			const cards = domCards(domStack)
			const apiIds = new Set(apiCards.map(function (card) {
				return String(card.id)
			}))
			const used = new Set()
			cards.forEach(function (card) {
				if (card.dataset.deckclId && apiIds.has(card.dataset.deckclId)) {
					used.add(card.dataset.deckclId)
				} else {
					delete card.dataset.deckclId
				}
			})
			const untagged = cards.filter(function (card) {
				return !card.dataset.deckclId
			})
			const leftover = apiCards.filter(function (card) {
				return !used.has(String(card.id))
			})
			if (untagged.length === leftover.length) {
				untagged.forEach(function (card, i) {
					card.dataset.deckclId = String(leftover[i].id)
				})
			}
		})
	}

	const BADGE_ICON_OPEN = '<svg fill="currentColor" width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M10,17L5,12L6.41,10.58L10,14.17L17.59,6.58L19,8M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3Z"/></svg>'
	const BADGE_ICON_DONE = '<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><path d="M6.3 11.4 2.8 7.9l1.1-1.1 2.4 2.4 5.2-5.2 1.1 1.1-6.3 6.3z"/></svg>'

	function badgeIcon() {
		const icon = el('span', 'deckcl-badge__icon', { 'aria-hidden': 'true' })
		icon.innerHTML = BADGE_ICON_OPEN
		return icon
	}

	function badgeHost(card) {
		const native = [...card.querySelectorAll('.inline-badges')].find(function (node) {
			return !node.closest('.deckcl-controls')
		})
		const synthetic = card.querySelector('.deckcl-controls')
		if (native) {
			if (synthetic) {
				synthetic.remove()
			}
			return native
		}
		if (synthetic) {
			return synthetic.querySelector('.inline-badges')
		}
		const controls = el('div', 'card-controls compact-item deckcl-controls')
		const badges = el('div', 'badges')
		const left = el('div', 'badge-left')
		const inline = el('div', 'inline-badges')
		left.appendChild(inline)
		badges.appendChild(left)
		controls.appendChild(badges)
		card.appendChild(controls)
		return inline
	}

	function paintBadges() {
		document.querySelectorAll('.stack .card').forEach(function (card) {
			const id = card.dataset.deckclId
			const stat = id ? summary[id] : null
			const existing = [...card.querySelectorAll('.deckcl-badge')].filter(function (badge) {
				return badge.closest('.card') === card
			})
			if (!stat || !stat.total) {
				existing.forEach(function (badge) {
					badge.remove()
				})
				const synthetic = card.querySelector('.deckcl-controls')
				if (synthetic) {
					synthetic.remove()
				}
				return
			}
			const host = badgeHost(card)
			let badge = existing[0]
			if (!badge) {
				badge = el('div', 'icon-badge deckcl-badge')
				badge.title = tr('Checklist')
				const count = el('span', 'deckcl-badge__count')
				badge.append(badgeIcon(), count)
			}
			const countLabel = stat.checked + '/' + stat.total
			const countNode = badge.querySelector('.deckcl-badge__count')
			if (countNode && countNode.textContent !== countLabel) {
				countNode.textContent = countLabel
			}
			const done = stat.total > 0 && stat.checked === stat.total
			const doneFlag = done ? '1' : '0'
			if (badge.dataset.done !== doneFlag) {
				badge.dataset.done = doneFlag
				badge.classList.toggle('deckcl-badge--done', done)
				const icon = badge.querySelector('.deckcl-badge__icon')
				if (icon) {
					icon.innerHTML = done ? BADGE_ICON_DONE : BADGE_ICON_OPEN
				}
			}
			if (badge.parentElement !== host) {
				host.appendChild(badge)
			}
			existing.slice(1).forEach(function (extra) {
				extra.remove()
			})
		})
	}

	let boardTimer = null
	function scheduleBoard() {
		clearTimeout(boardTimer)
		boardTimer = setTimeout(syncBoard, 200)
	}

	async function syncBoard() {
		const location = parseLocation()
		if (!location.boardId) {
			return
		}
		const stacks = domStacks()
		const cards = stacks.flatMap(function (stack) {
			return domCards(stack)
		})
		const archivedMode = cards.length > 0 && cards.every(function (card) {
			return card.classList.contains('card__archived')
		})
		const untagged = cards.some(function (card) {
			return !card.dataset.deckclId
		})
		const fresh = stackCache
			&& stackCache.boardId === location.boardId
			&& stackCache.archived === archivedMode
			&& Date.now() - stackCache.at < 2000
		if (!fresh && (untagged || !stackCache || stackCache.boardId !== location.boardId || stackCache.archived !== archivedMode)) {
			try {
				const path = archivedMode
					? '/stacks/' + location.boardId + '/archived'
					: '/stacks/' + location.boardId
				const response = await fetch(deckUrl(path), {
					headers: { requesttoken: requestToken(), Accept: 'application/json' },
				})
				if (response.ok) {
					stackCache = {
						boardId: location.boardId,
						archived: archivedMode,
						at: Date.now(),
						stacks: await response.json(),
					}
				}
			} catch (error) {
				// The badge can wait for the next board refresh.
			}
		}
		if (stackCache && stackCache.boardId === location.boardId && stackCache.archived === archivedMode) {
			assignCardIds(stacks, stackCache.stacks)
		}
		if (summaryBoardId !== location.boardId) {
			try {
				const data = await api('/boards/' + location.boardId + '/summary')
				Object.keys(summary).forEach(function (key) {
					delete summary[key]
				})
				if (data && !Array.isArray(data)) {
					Object.assign(summary, data)
				}
				summaryBoardId = location.boardId
			} catch (error) {
				summaryBoardId = location.boardId
			}
		}
		paintBadges()
	}

	function onRoute() {
		const location = parseLocation()
		if (location.cardId !== ui.cardId) {
			if (location.cardId) {
				loadCard(location.cardId)
			} else {
				loadToken++
				ui.cardId = null
				ui.loaded = false
				ui.checklists = []
				const panel = currentPanel()
				if (panel) {
					panel.remove()
				}
			}
		} else {
			ensureMounted()
		}
		scheduleBoard()
	}

	function routeChanged() {
		try {
			onRoute()
		} catch (error) {
			// A failure here must not cancel Deck's own navigation.
		}
	}

	const pushState = history.pushState
	history.pushState = function () {
		const result = pushState.apply(this, arguments)
		routeChanged()
		return result
	}
	const replaceState = history.replaceState
	history.replaceState = function () {
		const result = replaceState.apply(this, arguments)
		routeChanged()
		return result
	}
	window.addEventListener('popstate', routeChanged)
	window.addEventListener('hashchange', routeChanged)

	let mountTimer = null
	const observer = new MutationObserver(function (mutations) {
		if (rendering) {
			return
		}
		const foreign = mutations.some(function (mutation) {
			const node = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement
			return !(node && node.closest && node.closest('.deckcl, .deckcl-badge, .deckcl-desc__more, .deckcl-desc__chevron'))
		})
		if (!foreign) {
			return
		}
		clearTimeout(mountTimer)
		mountTimer = setTimeout(function () {
			ensureMounted()
			scheduleBoard()
		}, 80)
	})
	observer.observe(document.body, { childList: true, subtree: true })
	document.addEventListener('scroll', function (event) {
		if (ui.openMenu === null || rendering) {
			return
		}
		if (event.target && event.target.closest && event.target.closest('.deckcl__menu')) {
			return
		}
		ui.openMenu = null
		render()
	}, true)
	onRoute()
})()
