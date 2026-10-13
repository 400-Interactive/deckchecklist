<?php

declare(strict_types=1);

namespace OCA\DeckChecklist\Db;

use OCP\AppFramework\Db\Entity;

/**
 * @method int getId()
 * @method int getCardId()
 * @method void setCardId(int $cardId)
 * @method string getTitle()
 * @method void setTitle(string $title)
 * @method int getSortOrder()
 * @method void setSortOrder(int $sortOrder)
 */
class Checklist extends Entity {
	protected ?int $cardId = null;
	protected string $title = '';
	protected int $sortOrder = 0;

	public function __construct() {
		$this->addType('id', 'integer');
		$this->addType('cardId', 'integer');
		$this->addType('sortOrder', 'integer');
	}
}
