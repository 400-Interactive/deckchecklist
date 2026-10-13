<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Notification;

use OCA\Deck\Db\BoardMapper;
use OCA\Deck\Db\CardMapper;
use OCA\DeckChecklist\AppInfo\Application;
use OCP\Notification\IManager;
use Psr\Log\LoggerInterface;

class NotificationHelper {
	public function __construct(
		private IManager $notificationManager,
		private CardMapper $cardMapper,
		private BoardMapper $boardMapper,
		private LoggerInterface $logger,
		private ?string $userId,
	) {
	}

	/**
	 * @param list<string> $added
	 * @param list<string> $removed
	 */
	public function assigned(int $itemId, string $itemTitle, int $cardId, array $added, array $removed): void {
		foreach ($removed as $uid) {
			$this->dismiss($itemId, $uid);
		}
		$added = array_values(array_filter($added, fn (string $uid): bool => $uid !== '' && $uid !== $this->userId));
		if ($added === []) {
			return;
		}
		try {
			$card = $this->cardMapper->find($cardId, false);
			$boardId = $this->cardMapper->findBoardId($cardId);
			if ($boardId === null) {
				return;
			}
			$board = $this->boardMapper->find($boardId);
		} catch (\Throwable $e) {
			$this->logger->warning('Could not load the card for a checklist assignment notification', ['exception' => $e]);
			return;
		}
		foreach ($added as $uid) {
			try {
				$notification = $this->notificationManager->createNotification();
				$notification
					->setApp(Application::APP_ID)
					->setUser($uid)
					->setDateTime(new \DateTime())
					->setObject('item', (string)$itemId)
					->setSubject('item-assigned', [
						$itemTitle,
						$card->getTitle(),
						$board->getTitle(),
						(string)$this->userId,
						$boardId,
						$card->getId(),
					]);
				$this->notificationManager->notify($notification);
			} catch (\Throwable $e) {
				$this->logger->warning('Could not notify a checklist assignment', ['exception' => $e]);
			}
		}
	}

	public function dismiss(int $itemId, ?string $userId = null): void {
		try {
			$notification = $this->notificationManager->createNotification();
			$notification
				->setApp(Application::APP_ID)
				->setObject('item', (string)$itemId)
				->setSubject('item-assigned');
			if ($userId !== null && $userId !== '') {
				$notification->setUser($userId);
			}
			$this->notificationManager->markProcessed($notification);
		} catch (\Throwable $e) {
			$this->logger->warning('Could not dismiss a checklist assignment notification', ['exception' => $e]);
		}
	}

	/**
	 * @param list<int> $itemIds
	 */
	public function dismissItems(array $itemIds): void {
		foreach ($itemIds as $itemId) {
			$this->dismiss($itemId);
		}
	}
}
