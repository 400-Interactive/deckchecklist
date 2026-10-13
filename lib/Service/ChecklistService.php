<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Service;

use OCA\Deck\BadRequestException;
use OCA\Deck\Db\Acl;
use OCA\Deck\Db\BoardMapper;
use OCA\Deck\Db\CardMapper;
use OCA\Deck\NoPermissionException;
use OCA\Deck\Service\AssignmentService;
use OCA\Deck\Service\CardService;
use OCA\Deck\Service\PermissionService;
use OCA\Deck\StatusException;
use OCA\DeckChecklist\Db\Assignee;
use OCA\DeckChecklist\Db\AssigneeMapper;
use OCA\DeckChecklist\Db\Checklist;
use OCA\DeckChecklist\Db\ChecklistItem;
use OCA\DeckChecklist\Db\ChecklistItemMapper;
use OCA\DeckChecklist\Db\ChecklistMapper;
use OCA\DeckChecklist\Notification\NotificationHelper;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\DB\QueryBuilder\IQueryBuilder;
use OCP\IDBConnection;
use OCP\IUserManager;
use OCP\Server;
use OCP\UserStatus\IManager as IUserStatusManager;
use OCP\UserStatus\IUserStatus;

class ChecklistService {
	public function __construct(
		private IDBConnection $db,
		private ChecklistMapper $lists,
		private ChecklistItemMapper $items,
		private AssigneeMapper $assignees,
		private PermissionService $permissionService,
		private CardMapper $cardMapper,
		private BoardMapper $boardMapper,
		private CardService $cardService,
		private AssignmentService $assignmentService,
		private NotificationHelper $notifications,
		private IUserManager $userManager,
		private ?string $userId,
	) {
	}

	/**
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	public function getCard(int $cardId): array {
		$this->assertReadable($cardId);
		return $this->payload($cardId);
	}

	/**
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	public function createList(int $cardId, string $title): array {
		$this->assertEditable($cardId);
		$title = $this->cleanTitle($title, 255);
		$order = 0;
		foreach ($this->lists->findByCard($cardId) as $list) {
			$order = max($order, $list->getSortOrder() + 1);
		}
		$list = new Checklist();
		$list->setCardId($cardId);
		$list->setTitle($title);
		$list->setSortOrder($order);
		$this->lists->insert($list);
		return $this->payload($cardId);
	}

	/**
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	public function updateList(int $listId, string $title): array {
		$list = $this->requireList($listId);
		$this->assertEditable($list->getCardId());
		$list->setTitle($this->cleanTitle($title, 255));
		$this->lists->update($list);
		return $this->payload($list->getCardId());
	}

	/**
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	public function deleteList(int $listId): array {
		$list = $this->requireList($listId);
		$cardId = $list->getCardId();
		$this->assertEditable($cardId);
		$this->db->beginTransaction();
		try {
			$this->deleteListContents($listId);
			$this->lists->delete($list);
			$this->db->commit();
		} catch (\Throwable $e) {
			$this->db->rollBack();
			throw $e;
		}
		return $this->payload($cardId);
	}

	/**
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	public function createItem(int $listId, string $title): array {
		$list = $this->requireList($listId);
		$this->assertEditable($list->getCardId());
		$title = $this->cleanTitle($title, 1000);
		$order = 0;
		foreach ($this->items->findByList($listId) as $item) {
			$order = max($order, $item->getSortOrder() + 1);
		}
		$item = new ChecklistItem();
		$item->setListId($listId);
		$item->setTitle($title);
		$item->setChecked(0);
		$item->setSortOrder($order);
		$this->items->insert($item);
		return $this->payload($list->getCardId());
	}

	/**
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	public function updateItem(int $itemId, string $title, bool $checked, bool $updateDuedate, ?string $duedate): array {
		$item = $this->requireItem($itemId);
		$list = $this->requireList($item->getListId());
		$this->assertEditable($list->getCardId());
		$item->setTitle($this->cleanTitle($title, 1000));
		$item->setChecked($checked ? 1 : 0);
		if ($updateDuedate) {
			$item->setDuedate($this->cleanDate($duedate));
		}
		$this->items->update($item);
		return $this->payload($list->getCardId());
	}

	/**
	 * @param list<string> $userIds
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	public function setAssignees(int $itemId, array $userIds): array {
		$item = $this->requireItem($itemId);
		$list = $this->requireList($item->getListId());
		$cardId = $list->getCardId();
		$this->assertEditable($cardId);
		$wanted = [];
		foreach ($userIds as $userId) {
			$uid = trim((string)$userId);
			if ($uid !== '' && !in_array($uid, $wanted, true)) {
				$wanted[] = $uid;
			}
		}
		$allowed = array_column($this->members($cardId), 'uid');
		$existing = [];
		foreach ($this->assignees->findByItems([$itemId]) as $assignee) {
			$allowed[] = $assignee->getUserId();
			$existing[] = $assignee->getUserId();
		}
		foreach ($wanted as $uid) {
			if (!in_array($uid, $allowed, true)) {
				throw new \InvalidArgumentException('Unknown member');
			}
		}
		$this->db->beginTransaction();
		try {
			$this->assignees->deleteByItemIds([$itemId]);
			foreach ($wanted as $uid) {
				$assignee = new Assignee();
				$assignee->setItemId($itemId);
				$assignee->setUserId($uid);
				$this->assignees->insert($assignee);
			}
			$this->db->commit();
		} catch (\Throwable $e) {
			$this->db->rollBack();
			throw $e;
		}
		$this->notifications->assigned(
			$itemId,
			$item->getTitle(),
			$cardId,
			array_values(array_diff($wanted, $existing)),
			array_values(array_diff($existing, $wanted)),
		);
		return $this->payload($cardId);
	}

	/**
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>, createdCardId: int}
	 */
	public function convertItem(int $itemId): array {
		$item = $this->requireItem($itemId);
		$list = $this->requireList($item->getListId());
		$cardId = $list->getCardId();
		$this->assertEditable($cardId);
		if ($this->userId === null || $this->userId === '') {
			throw new NoPermissionException('Permission denied');
		}
		$source = $this->cardMapper->find($cardId, false);
		$stackId = (int)$source->getStackId();
		$order = 0;
		foreach ($this->cardMapper->findAllByStack($stackId) as $existing) {
			$order = max($order, ((int)$existing->getOrder()) + 1);
		}
		$title = $item->getTitle();
		if (mb_strlen($title) > 255) {
			$title = mb_substr($title, 0, 255);
		}
		$due = null;
		if ($this->cleanDate($item->getDuedate()) !== null) {
			$due = new \DateTime($item->getDuedate() . ' 12:00:00', new \DateTimeZone('UTC'));
		}
		$userIds = array_map(static fn (Assignee $assignee): string => $assignee->getUserId(), $this->assignees->findByItems([$itemId]));
		$created = $this->cardService->create($title, $stackId, 'plain', $order, $this->userId, '', $due);
		try {
			foreach ($userIds as $uid) {
				$this->assignmentService->assignUser($created->getId(), $uid);
			}
			$this->db->beginTransaction();
			try {
				$this->assignees->deleteByItemIds([$itemId]);
				$this->items->delete($item);
				$this->db->commit();
				$this->notifications->dismiss($itemId);
			} catch (\Throwable $e) {
				$this->db->rollBack();
				throw $e;
			}
		} catch (\Throwable $e) {
			try {
				$this->cardService->delete($created->getId());
			} catch (\Throwable) {
			}
			if ($e instanceof BadRequestException || $e instanceof StatusException) {
				throw new \InvalidArgumentException($e->getMessage());
			}
			throw $e;
		}
		$payload = $this->payload($cardId);
		$payload['createdCardId'] = $created->getId();
		return $payload;
	}

	/**
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	public function deleteItem(int $itemId): array {
		$item = $this->requireItem($itemId);
		$list = $this->requireList($item->getListId());
		$this->assertEditable($list->getCardId());
		$this->db->beginTransaction();
		try {
			$this->assignees->deleteByItemIds([$itemId]);
			$this->items->delete($item);
			$this->db->commit();
		} catch (\Throwable $e) {
			$this->db->rollBack();
			throw $e;
		}
		$this->notifications->dismiss($itemId);
		return $this->payload($list->getCardId());
	}

	/**
	 * @param list<int> $itemIds
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	public function reorderItems(int $listId, array $itemIds): array {
		$list = $this->requireList($listId);
		$this->assertEditable($list->getCardId());
		$this->reorder($this->items->findByList($listId), $itemIds, function (int $id): ChecklistItem {
			return $this->items->find($id);
		}, function (ChecklistItem $item, int $index): void {
			$item->setSortOrder($index);
			$this->items->update($item);
		});
		return $this->payload($list->getCardId());
	}

	/**
	 * @param list<int> $listIds
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	public function reorderLists(int $cardId, array $listIds): array {
		$this->assertEditable($cardId);
		$this->reorder($this->lists->findByCard($cardId), $listIds, function (int $id): Checklist {
			return $this->lists->find($id);
		}, function (Checklist $list, int $index): void {
			$list->setSortOrder($index);
			$this->lists->update($list);
		});
		return $this->payload($cardId);
	}

	/**
	 * @return array<string, array{checked: int, total: int}>
	 */
	public function boardSummary(int $boardId): array {
		$this->permissionService->checkPermission($this->boardMapper, $boardId, Acl::PERMISSION_READ);
		$qb = $this->db->getQueryBuilder();
		$qb->select('l.id', 'l.card_id')
			->from('deckcl_lists', 'l')
			->innerJoin('l', 'deck_cards', 'c', 'c.id = l.card_id')
			->innerJoin('c', 'deck_stacks', 's', 's.id = c.stack_id')
			->where($qb->expr()->eq('s.board_id', $qb->createNamedParameter($boardId, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('c.deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)))
			->andWhere($qb->expr()->eq('s.deleted_at', $qb->createNamedParameter(0, IQueryBuilder::PARAM_INT)));
		$listRows = $qb->executeQuery()->fetchAll();
		if ($listRows === []) {
			return [];
		}
		$listToCard = [];
		foreach ($listRows as $row) {
			$listToCard[(int)$row['id']] = (int)$row['card_id'];
		}
		$qb = $this->db->getQueryBuilder();
		$qb->select('list_id', 'checked')
			->from('deckcl_items')
			->where($qb->expr()->in('list_id', $qb->createNamedParameter(array_keys($listToCard), IQueryBuilder::PARAM_INT_ARRAY)));
		$summary = [];
		foreach ($qb->executeQuery()->fetchAll() as $row) {
			$cardId = $listToCard[(int)$row['list_id']] ?? null;
			if ($cardId === null) {
				continue;
			}
			$key = (string)$cardId;
			if (!isset($summary[$key])) {
				$summary[$key] = ['checked' => 0, 'total' => 0];
			}
			$summary[$key]['total']++;
			if ($this->isChecked($row['checked'])) {
				$summary[$key]['checked']++;
			}
		}
		return $summary;
	}

	public function deleteByCard(int $cardId): void {
		$this->db->beginTransaction();
		try {
			foreach ($this->lists->findByCard($cardId) as $list) {
				$this->deleteListContents($list->getId());
				$this->lists->delete($list);
			}
			$this->db->commit();
		} catch (\Throwable $e) {
			$this->db->rollBack();
			throw $e;
		}
	}

	/**
	 * @return array{canEdit: bool, members: list<array{uid: string, displayName: string}>, checklists: list<array<string, mixed>>}
	 */
	private function payload(int $cardId): array {
		$lists = $this->lists->findByCard($cardId);
		$itemsByList = [];
		$itemIds = [];
		foreach ($lists as $list) {
			$rows = $this->items->findByList($list->getId());
			$itemsByList[$list->getId()] = $rows;
			foreach ($rows as $item) {
				$itemIds[] = $item->getId();
			}
		}
		$assigneesByItem = [];
		foreach ($this->assignees->findByItems($itemIds) as $assignee) {
			$assigneesByItem[$assignee->getItemId()][] = [
				'uid' => $assignee->getUserId(),
				'displayName' => $this->displayName($assignee->getUserId()),
			];
		}
		$members = $this->members($cardId);
		$uids = array_column($members, 'uid');
		foreach ($assigneesByItem as $people) {
			foreach ($people as $person) {
				$uids[] = $person['uid'];
			}
		}
		$statuses = $this->statuses($uids);
		foreach ($members as &$member) {
			$member['status'] = $statuses[$member['uid']] ?? null;
		}
		unset($member);
		foreach ($assigneesByItem as &$people) {
			foreach ($people as &$person) {
				$person['status'] = $statuses[$person['uid']] ?? null;
			}
		}
		unset($people, $person);
		$checklists = [];
		foreach ($lists as $list) {
			$items = [];
			foreach ($itemsByList[$list->getId()] as $item) {
				$people = $assigneesByItem[$item->getId()] ?? [];
				usort($people, static fn (array $a, array $b): int => strcasecmp($a['displayName'], $b['displayName']));
				$items[] = [
					'id' => $item->getId(),
					'title' => $item->getTitle(),
					'checked' => $this->isChecked($item->getChecked()),
					'sortOrder' => $item->getSortOrder(),
					'duedate' => $this->cleanDate($item->getDuedate()),
					'assignees' => $people,
				];
			}
			$checklists[] = [
				'id' => $list->getId(),
				'title' => $list->getTitle(),
				'sortOrder' => $list->getSortOrder(),
				'items' => $items,
			];
		}
		return [
			'canEdit' => $this->canEdit($cardId),
			'members' => $members,
			'checklists' => $checklists,
		];
	}

	/**
	 * @param list<string> $uids
	 * @return array<string, string>
	 */
	private function statuses(array $uids): array {
		$uids = array_values(array_unique(array_filter($uids, static fn (string $uid): bool => $uid !== '')));
		if ($uids === []) {
			return [];
		}
		try {
			$manager = Server::get(IUserStatusManager::class);
		} catch (\Throwable) {
			return [];
		}
		$statuses = [];
		foreach ($manager->getUserStatuses($uids) as $uid => $status) {
			$value = $status->getStatus();
			if ($value === '' || $value === IUserStatus::OFFLINE || $value === IUserStatus::INVISIBLE) {
				continue;
			}
			$statuses[(string)$uid] = $value;
		}
		return $statuses;
	}

	/**
	 * @return list<array{uid: string, displayName: string}>
	 */
	private function members(int $cardId): array {
		$boardId = $this->cardMapper->findBoardId($cardId);
		if ($boardId === null) {
			return [];
		}
		$members = [];
		foreach ($this->permissionService->findUsers($boardId) as $uid => $user) {
			$id = (string)$uid;
			$members[] = [
				'uid' => $id,
				'displayName' => $user->getDisplayName() ?: $id,
			];
		}
		usort($members, static fn (array $a, array $b): int => strcasecmp($a['displayName'], $b['displayName']));
		return $members;
	}

	private function displayName(string $uid): string {
		return $this->userManager->getDisplayName($uid) ?: $uid;
	}

	private function deleteListContents(int $listId): void {
		$ids = array_map(static fn (ChecklistItem $item): int => $item->getId(), $this->items->findByList($listId));
		$this->notifications->dismissItems($ids);
		$this->assignees->deleteByItemIds($ids);
		$this->items->deleteByList($listId);
	}

	/**
	 * @template T of object
	 * @param list<T> $existingRows
	 * @param list<int> $incomingIds
	 * @param callable(int): T $find
	 * @param callable(T, int): void $save
	 */
	private function reorder(array $existingRows, array $incomingIds, callable $find, callable $save): void {
		$existing = [];
		foreach ($existingRows as $row) {
			$existing[] = (int)$row->getId();
		}
		$incoming = array_map(static fn (mixed $id): int => (int)$id, $incomingIds);
		$sortedExisting = $existing;
		$sortedIncoming = $incoming;
		sort($sortedExisting);
		sort($sortedIncoming);
		if ($sortedExisting !== $sortedIncoming) {
			throw new \InvalidArgumentException('Invalid item order');
		}
		$this->db->beginTransaction();
		try {
			foreach ($incoming as $index => $id) {
				$save($find($id), $index);
			}
			$this->db->commit();
		} catch (\Throwable $e) {
			$this->db->rollBack();
			throw $e;
		}
	}

	private function assertReadable(int $cardId): void {
		$this->permissionService->checkPermission($this->cardMapper, $cardId, Acl::PERMISSION_READ);
	}

	private function assertEditable(int $cardId): void {
		$this->assertReadable($cardId);
		if (!$this->canEdit($cardId)) {
			throw new NoPermissionException('Permission denied');
		}
	}

	private function canEdit(int $cardId): bool {
		$boardId = $this->cardMapper->findBoardId($cardId);
		if ($boardId === null) {
			return false;
		}
		$permissions = $this->permissionService->getPermissions($boardId);
		if (($permissions[Acl::PERMISSION_EDIT] ?? false) !== true) {
			return false;
		}
		$board = $this->boardMapper->find($boardId);
		if ($this->isChecked($board->getArchived())) {
			return false;
		}
		$card = $this->cardMapper->find($cardId, false);
		return !$this->isChecked($card->getArchived());
	}

	private function requireList(int $listId): Checklist {
		try {
			return $this->lists->find($listId);
		} catch (DoesNotExistException $e) {
			throw new DoesNotExistException('Checklist not found');
		}
	}

	private function requireItem(int $itemId): ChecklistItem {
		try {
			return $this->items->find($itemId);
		} catch (DoesNotExistException $e) {
			throw new DoesNotExistException('Checklist item not found');
		}
	}

	private function cleanTitle(string $title, int $max): string {
		$title = trim($title);
		if ($title === '') {
			throw new \InvalidArgumentException('Title is required');
		}
		if (mb_strlen($title) > $max) {
			throw new \InvalidArgumentException('Title is too long');
		}
		return $title;
	}

	private function cleanDate(mixed $value): ?string {
		if ($value === null || $value === '') {
			return null;
		}
		if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
			throw new \InvalidArgumentException('Invalid date');
		}
		[$year, $month, $day] = array_map('intval', explode('-', $value));
		if (!checkdate($month, $day, $year)) {
			throw new \InvalidArgumentException('Invalid date');
		}
		return $value;
	}

	private function isChecked(mixed $value): bool {
		return $value === true || $value === 1 || $value === '1';
	}
}
