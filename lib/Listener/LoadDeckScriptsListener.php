<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Listener;

use OCA\DeckChecklist\AppInfo\Application;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;
use OCP\EventDispatcher\Event;
use OCP\EventDispatcher\IEventListener;
use OCP\Util;

/** @template-implements IEventListener<BeforeTemplateRenderedEvent> */
class LoadDeckScriptsListener implements IEventListener {
	public function handle(Event $event): void {
		if (!$event instanceof BeforeTemplateRenderedEvent) {
			return;
		}
		if (!$event->isLoggedIn() || $event->getResponse()->getApp() !== 'deck') {
			return;
		}
		Util::addScript(Application::APP_ID, 'deckchecklist-ui');
		Util::addStyle(Application::APP_ID, 'style');
	}
}
