<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method int getId()
 * @method int getItemId()
 * @method void setItemId(int $itemId)
 * @method string getUserId()
 * @method void setUserId(string $userId)
 */
class Assignee extends Entity {
	protected ?int $itemId = null;
	protected string $userId = '';

	public function __construct() {
		$this->addType('id', 'integer');
		$this->addType('itemId', 'integer');
	}
}
