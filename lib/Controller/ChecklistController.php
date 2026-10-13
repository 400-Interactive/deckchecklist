<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Controller;

use OCA\Deck\NoPermissionException;
use OCA\DeckChecklist\AppInfo\Application;
use OCA\DeckChecklist\Service\ChecklistService;
use OCP\AppFramework\Controller;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\AppFramework\Http;
use OCP\AppFramework\Http\Attribute\NoAdminRequired;
use OCP\AppFramework\Http\DataResponse;
use OCP\IRequest;
use Psr\Log\LoggerInterface;

class ChecklistController extends Controller {
	public function __construct(
		IRequest $request,
		private ChecklistService $checklistService,
		private LoggerInterface $logger,
	) {
		parent::__construct(Application::APP_ID, $request);
	}

	#[NoAdminRequired]
	public function getCard(int $cardId): DataResponse {
		return $this->respond(fn (): array => $this->checklistService->getCard($cardId));
	}

	#[NoAdminRequired]
	public function createList(int $cardId, string $title = ''): DataResponse {
		return $this->respond(fn (): array => $this->checklistService->createList($cardId, $title));
	}

	#[NoAdminRequired]
	public function updateList(int $listId, string $title = ''): DataResponse {
		return $this->respond(fn (): array => $this->checklistService->updateList($listId, $title));
	}

	#[NoAdminRequired]
	public function deleteList(int $listId): DataResponse {
		return $this->respond(fn (): array => $this->checklistService->deleteList($listId));
	}

	#[NoAdminRequired]
	public function createItem(int $listId, string $title = ''): DataResponse {
		return $this->respond(fn (): array => $this->checklistService->createItem($listId, $title));
	}

	#[NoAdminRequired]
	public function updateItem(int $itemId): DataResponse {
		$title = (string)$this->request->getParam('title', '');
		$checked = $this->request->getParam('checked', 0);
		$isChecked = $checked === true || $checked === 1 || $checked === '1';
		$params = $this->request->getParams();
		$updateDuedate = array_key_exists('duedate', $params);
		$duedate = $updateDuedate ? $params['duedate'] : null;
		$duedate = is_string($duedate) ? $duedate : null;
		return $this->respond(fn (): array => $this->checklistService->updateItem($itemId, $title, $isChecked, $updateDuedate, $duedate));
	}

	#[NoAdminRequired]
	public function deleteItem(int $itemId): DataResponse {
		return $this->respond(fn (): array => $this->checklistService->deleteItem($itemId));
	}

	#[NoAdminRequired]
	public function setAssignees(int $itemId): DataResponse {
		$userIds = $this->request->getParam('userIds', []);
		if (!is_array($userIds)) {
			return new DataResponse(['message' => 'Invalid members'], Http::STATUS_BAD_REQUEST);
		}
		return $this->respond(fn (): array => $this->checklistService->setAssignees($itemId, $userIds));
	}

	#[NoAdminRequired]
	public function convertItem(int $itemId): DataResponse {
		return $this->respond(fn (): array => $this->checklistService->convertItem($itemId));
	}

	#[NoAdminRequired]
	public function reorderItems(int $listId): DataResponse {
		$itemIds = $this->request->getParam('itemIds', []);
		if (!is_array($itemIds)) {
			return new DataResponse(['message' => 'Invalid item order'], Http::STATUS_BAD_REQUEST);
		}
		return $this->respond(fn (): array => $this->checklistService->reorderItems($listId, $itemIds));
	}

	#[NoAdminRequired]
	public function reorderLists(int $cardId): DataResponse {
		$listIds = $this->request->getParam('listIds', []);
		if (!is_array($listIds)) {
			return new DataResponse(['message' => 'Invalid list order'], Http::STATUS_BAD_REQUEST);
		}
		return $this->respond(fn (): array => $this->checklistService->reorderLists($cardId, $listIds));
	}

	#[NoAdminRequired]
	public function boardSummary(int $boardId): DataResponse {
		return $this->respond(fn (): array => $this->checklistService->boardSummary($boardId));
	}

	/**
	 * @param callable(): array $action
	 */
	private function respond(callable $action): DataResponse {
		try {
			return new DataResponse($action());
		} catch (NoPermissionException) {
			return new DataResponse(['message' => 'Permission denied'], Http::STATUS_FORBIDDEN);
		} catch (DoesNotExistException) {
			return new DataResponse(['message' => 'Not found'], Http::STATUS_NOT_FOUND);
		} catch (\InvalidArgumentException $e) {
			return new DataResponse(['message' => $e->getMessage()], Http::STATUS_BAD_REQUEST);
		} catch (\Throwable $e) {
			$this->logger->error('Deck checklist request failed', ['exception' => $e]);
			return new DataResponse(['message' => 'Internal error'], Http::STATUS_INTERNAL_SERVER_ERROR);
		}
	}
}
