<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Notification;

use OCA\Deck\Db\CardMapper;
use OCA\DeckChecklist\AppInfo\Application;
use OCP\AppFramework\Db\DoesNotExistException;
use OCP\IURLGenerator;
use OCP\IUserManager;
use OCP\L10N\IFactory;
use OCP\Notification\AlreadyProcessedException;
use OCP\Notification\INotification;
use OCP\Notification\INotifier;
use OCP\Notification\UnknownNotificationException;

class Notifier implements INotifier {
	public function __construct(
		private IFactory $l10nFactory,
		private IURLGenerator $url,
		private IUserManager $userManager,
		private CardMapper $cardMapper,
	) {
	}

	public function getID(): string {
		return Application::APP_ID;
	}

	public function getName(): string {
		return $this->l10nFactory->get(Application::APP_ID)->t('Deck Trello-style Checklists');
	}

	public function prepare(INotification $notification, string $languageCode): INotification {
		if ($notification->getApp() !== Application::APP_ID || $notification->getSubject() !== 'item-assigned') {
			throw new UnknownNotificationException();
		}
		$l = $this->l10nFactory->get(Application::APP_ID, $languageCode);
		$params = $notification->getSubjectParameters();
		$cardId = (int)($params[5] ?? 0);
		$boardId = (int)($params[4] ?? 0);
		if ($cardId === 0 || $boardId === 0 || count($params) < 4) {
			throw new AlreadyProcessedException();
		}
		try {
			$this->cardMapper->find($cardId, false);
		} catch (DoesNotExistException) {
			throw new AlreadyProcessedException();
		}

		$assignerId = (string)$params[3];
		$assigner = $this->userManager->get($assignerId);
		$assignerName = $assigner !== null ? $assigner->getDisplayName() : $assignerId;
		$itemTitle = (string)$params[0];
		$cardTitle = (string)$params[1];
		$link = $this->url->linkToRouteAbsolute('deck.page.indexCard', ['boardId' => $boardId, 'cardId' => $cardId]);

		$notification->setIcon($this->url->getAbsoluteURL($this->url->imagePath(Application::APP_ID, 'app.svg')));
		$notification->setParsedSubject(
			$l->t('%1$s assigned the checklist item "%2$s" on the card "%3$s" to you.', [$assignerName, $itemTitle, $cardTitle])
		);
		$notification->setRichSubject(
			$l->t('{user} assigned the checklist item {item} on the card {card} to you.'),
			[
				'user' => [
					'type' => 'user',
					'id' => $assignerId,
					'name' => $assignerName,
				],
				'item' => [
					'type' => 'highlight',
					'id' => $notification->getObjectId(),
					'name' => $itemTitle,
				],
				'card' => [
					'type' => 'highlight',
					'id' => (string)$cardId,
					'name' => $cardTitle,
					'link' => $link,
				],
			]
		);
		$notification->setLink($link);
		return $notification;
	}
}
