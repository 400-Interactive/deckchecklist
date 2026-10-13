<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\AppInfo;

use OCA\DeckChecklist\Listener\CardDeletedListener;
use OCA\DeckChecklist\Listener\LoadDeckScriptsListener;
use OCA\DeckChecklist\Notification\Notifier;
use OCP\AppFramework\App;
use OCP\AppFramework\Bootstrap\IBootstrap;
use OCP\AppFramework\Bootstrap\IBootContext;
use OCP\AppFramework\Bootstrap\IRegistrationContext;
use OCP\AppFramework\Http\Events\BeforeTemplateRenderedEvent;

class Application extends App implements IBootstrap {
	public const APP_ID = 'deckchecklist';

	public function __construct(array $urlParams = []) {
		parent::__construct(self::APP_ID, $urlParams);
	}

	public function register(IRegistrationContext $context): void {
		$context->registerEventListener(BeforeTemplateRenderedEvent::class, LoadDeckScriptsListener::class);
		$context->registerEventListener(\OCA\Deck\Event\CardDeletedEvent::class, CardDeletedListener::class);
		$context->registerNotifierService(Notifier::class);
	}

	public function boot(IBootContext $context): void {
	}
}
