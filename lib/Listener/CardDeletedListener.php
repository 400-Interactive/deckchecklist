<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Listener;

use OCA\Deck\Event\CardDeletedEvent;
use OCA\DeckChecklist\Service\ChecklistService;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;

/** @template-implements IEventListener<CardDeletedEvent> */
class CardDeletedListener implements IEventListener {
	public function __construct(
		private ChecklistService $checklistService,
	) {
	}

	public function handle(Event $event): void {
		if (!$event instanceof CardDeletedEvent) {
			return;
		}
		$this->checklistService->deleteByCard($event->getCard()->getId());
	}
}
